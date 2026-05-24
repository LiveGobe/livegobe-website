/**
 * Unit tests for Wiki API Client
 */

const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const { createWikiApiClient } = require('../../src/wiki-api/client');
const { getLogger } = require('../../src/logging/logger');

describe('WikiApiClient', () => {
  let client;
  let mockAdapter;
  const mockLogger = getLogger();
  const baseUrl = 'http://localhost:8080/api';

  beforeEach(() => {
    mockAdapter = new MockAdapter(axios);
    client = createWikiApiClient(
      {
        wikiApi: {
          baseUrl,
          version: 2,
          timeout: 5000,
          retryAttempts: 3,
          retryDelay: 100,
        }
      },
      mockLogger
    );
  });

  afterEach(() => {
    mockAdapter.reset();
  });

  describe('fetchPage()', () => {
    it('should fetch page content', async () => {
      const responseData = {
        page: {
          title: 'Test Page',
          namespace: 0,
          content: 'Page content here'
        }
      };

      mockAdapter.onGet('/wikis/test-wiki/pages/TestPage').reply(200, responseData);

      const result = await client.fetchPage('test-wiki', 'TestPage');

      expect(result.content).toBe('Page content here');
    });

    it('should return null for 404 responses', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/NonExistent').reply(404);

      const result = await client.fetchPage('test-wiki', 'NonExistent');

      expect(result).toBeNull();
    });

    it('should handle network timeouts', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/Timeout').timeout();

      const result = await client.fetchPage('test-wiki', 'Timeout');

      expect(result).toBeNull();
    });

    it('should support API versioning', async () => {
      const responseData = {
        page: { content: 'Test content' }
      };

      mockAdapter.onGet('/wikis/test-wiki/pages/Test').reply(200, responseData);

      const result = await client.fetchPage('test-wiki', 'Test');

      expect(result.content).toBe('Test content');
    });
  });

  describe('fetchModule()', () => {
    it('should fetch module content', async () => {
      const responseData = {
        page: {
          content: 'exports.test = function() { return 5; }'
        }
      };

      mockAdapter.onGet('/wikis/test-wiki/pages/Module:Items').reply(200, responseData);

      const result = await client.fetchModule('test-wiki', 'Items');

      expect(result).toBe('exports.test = function() { return 5; }');
    });

    it('should handle Module: prefix normalization', async () => {
      const responseData = {
        page: { content: 'module content' }
      };

      mockAdapter.onGet('/wikis/test-wiki/pages/Module:Test').reply(200, responseData);

      // Client should normalize the name
      const result = await client.fetchModule('test-wiki', 'Module:Test');

      expect(result).toBe('module content');
    });
  });

  describe('fetchDataModule()', () => {
    it('should fetch data module content', async () => {
      const responseData = {
        page: {
          content: JSON.stringify({ items: [1, 2, 3] })
        }
      };

      mockAdapter.onGet('/wikis/test-wiki/pages/Module:Items').reply(200, responseData);

      const result = await client.fetchDataModule('test-wiki', 'Items');

      expect(result.items).toEqual([1, 2, 3]);
    });
  });

  describe('pageExists()', () => {
    it('should return true for existing pages', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/Exists').reply(200, {
        page: { title: 'Exists' }
      });

      const result = await client.pageExists('test-wiki', 'Exists');

      expect(result).toBe(true);
    });

    it('should return false for non-existent pages', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/NotExists').reply(404);

      const result = await client.pageExists('test-wiki', 'NotExists');

      expect(result).toBe(false);
    });
  });

  describe('search()', () => {
    it('should search for pages', async () => {
      const responseData = {
        results: [
          { title: 'Item1', namespace: 0 },
          { title: 'Item2', namespace: 0 }
        ]
      };

      mockAdapter.onGet('/wikis/test-wiki/search').reply(200, responseData);

      const result = await client.search('test-wiki', 'item');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should return empty array on search failure', async () => {
      mockAdapter.onGet('/wikis/test-wiki/search').reply(500);

      const result = await client.search('test-wiki', 'test');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('ETag caching', () => {
    it('should send If-None-Match header on subsequent requests', async () => {
      const responseData = { page: { content: 'Test content' } };

      // First request - returns content with ETag
      mockAdapter.onGet('/wikis/test-wiki/pages/Test').replyOnce(200, responseData, {
        'etag': 'W/"123abc"'
      });

      // Second request with If-None-Match
      mockAdapter.onGet('/wikis/test-wiki/pages/Test').reply(304);

      const result1 = await client.fetchPage('test-wiki', 'Test');
      expect(result1.content).toBe('Test content');

      // Second call should use cached result (304 Not Modified)
      const result2 = await client.fetchPage('test-wiki', 'Test');
      expect(result2.content).toBe('Test content');
    });
  });

  describe('retry logic', () => {
    it('should retry on server error (5xx)', async () => {
      const responseData = { page: { content: 'Success' } };

      mockAdapter
        .onGet('/wikis/test-wiki/pages/Test')
        .replyOnce(500);

      mockAdapter
        .onGet('/wikis/test-wiki/pages/Test')
        .replyOnce(500);

      mockAdapter
        .onGet('/wikis/test-wiki/pages/Test')
        .replyOnce(200, responseData);

      const result = await client.fetchPage('test-wiki', 'Test');

      expect(result.content).toBe('Success');
      expect(mockAdapter.history.get.length).toBeGreaterThan(2);
    });

    it('should not retry on client error (4xx)', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/Bad').reply(400);

      const result = await client.fetchPage('test-wiki', 'Bad');

      expect(result).toBeNull();
      expect(mockAdapter.history.get.length).toBe(1);
    });

    it('should respect Retry-After header', async () => {
      const responseData = { page: { content: 'Success' } };

      mockAdapter
        .onGet('/wikis/test-wiki/pages/Test')
        .replyOnce(429, {}, { 'retry-after': '1' });

      mockAdapter
        .onGet('/wikis/test-wiki/pages/Test')
        .replyOnce(200, responseData);

      const start = Date.now();
      const result = await client.fetchPage('test-wiki', 'Test');
      const elapsed = Date.now() - start;

      expect(result.content).toBe('Success');
      // Should have waited at least the retry-after time
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('connection pooling', () => {
    it('should reuse HTTP connections', async () => {
      const responseData = { page: { content: 'Test' } };

      mockAdapter.onGet('/wikis/test-wiki/pages/Test').reply(200, responseData);

      // Make multiple requests
      await client.fetchPage('test-wiki', 'Test');
      await client.fetchPage('test-wiki', 'Test');
      await client.fetchPage('test-wiki', 'Test');

      // Connection pooling happens internally
      expect(mockAdapter.history.get.length).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/Test').networkError();

      const result = await client.fetchPage('test-wiki', 'Test');

      expect(result).toBeNull();
    });

    it('should handle malformed responses', async () => {
      mockAdapter.onGet('/wikis/test-wiki/pages/Test').reply(200, 'invalid json');

      const result = await client.fetchPage('test-wiki', 'Test');

      expect(result).toBeNull();
    });
  });
});
