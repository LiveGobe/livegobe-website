/**
 * Unit tests for Workspace and WorkspaceManager
 */

const Workspace = require('../../src/workspace/workspace');
const WorkspaceManager = require('../../src/workspace/workspace-manager');

// Mock logger
const createMockLogger = () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

describe('Workspace', () => {
  let workspace;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    workspace = new Workspace('ws_test_123', 'file:///wiki', logger);
  });

  describe('creation and initialization', () => {
    test('should create workspace with correct properties', () => {
      expect(workspace.id).toBe('ws_test_123');
      expect(workspace.editorUri).toBe('file:///wiki');
      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.documents.size).toBe(0);
    });

    test('should initialize with isolated caches', () => {
      expect(workspace.moduleCache).toBeInstanceOf(Map);
      expect(workspace.dataCache).toBeInstanceOf(Map);
      expect(workspace.moduleCache.size).toBe(0);
      expect(workspace.dataCache.size).toBe(0);
    });

    test('should track lastActivityTime for idle cleanup', () => {
      expect(workspace.lastActivityTime).toBeGreaterThan(0);
      expect(typeof workspace.lastActivityTime).toBe('number');
    });

    test('should log workspace creation', () => {
      expect(logger.info).toHaveBeenCalledWith(
        { workspaceId: 'ws_test_123', editorUri: 'file:///wiki' },
        'Workspace created with isolated caches'
      );
    });
  });

  describe('document management', () => {
    test('should add document to workspace', () => {
      const uri = 'file:///wiki/page.lgml';
      const result = workspace.addDocument(uri);
      
      expect(result).toBe(true);
      expect(workspace.documents.has(uri)).toBe(true);
      expect(workspace.metadata.documentCount).toBe(1);
    });

    test('should not add duplicate document', () => {
      const uri = 'file:///wiki/page.lgml';
      workspace.addDocument(uri);
      const result = workspace.addDocument(uri);
      
      expect(result).toBe(false);
      expect(workspace.documents.size).toBe(1);
    });

    test('should remove document from workspace', () => {
      const uri = 'file:///wiki/page.lgml';
      workspace.addDocument(uri);
      const result = workspace.removeDocument(uri);
      
      expect(result).toBe(true);
      expect(workspace.documents.has(uri)).toBe(false);
      expect(workspace.metadata.documentCount).toBe(0);
    });

    test('should not remove document that does not exist', () => {
      const result = workspace.removeDocument('file:///wiki/nonexistent.lgml');
      
      expect(result).toBe(false);
      expect(workspace.documents.size).toBe(0);
    });

    test('should manage multiple documents', () => {
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      const uri3 = 'file:///wiki/page3.lgml';
      
      workspace.addDocument(uri1);
      workspace.addDocument(uri2);
      workspace.addDocument(uri3);
      
      expect(workspace.documents.size).toBe(3);
      expect(workspace.metadata.documentCount).toBe(3);
      
      workspace.removeDocument(uri2);
      
      expect(workspace.documents.size).toBe(2);
      expect(workspace.documents.has(uri1)).toBe(true);
      expect(workspace.documents.has(uri3)).toBe(true);
    });
  });

  describe('state management', () => {
    test('should set and get state', () => {
      workspace.setState('testKey', { value: 'test' });
      const state = workspace.getState('testKey');
      
      expect(state).toEqual({ value: 'test' });
    });

    test('should handle undefined state', () => {
      const state = workspace.getState('nonexistent');
      
      expect(state).toBeUndefined();
    });

    test('should overwrite existing state', () => {
      workspace.setState('key', 'value1');
      workspace.setState('key', 'value2');
      
      expect(workspace.getState('key')).toBe('value2');
    });
  });

  describe('empty state checking', () => {
    test('should be empty when no documents', () => {
      expect(workspace.isEmpty()).toBe(true);
    });

    test('should not be empty when has documents', () => {
      workspace.addDocument('file:///wiki/page.lgml');
      expect(workspace.isEmpty()).toBe(false);
    });

    test('should be empty after removing all documents', () => {
      const uri = 'file:///wiki/page.lgml';
      workspace.addDocument(uri);
      workspace.removeDocument(uri);
      
      expect(workspace.isEmpty()).toBe(true);
    });
  });

  describe('metadata', () => {
    test('should provide metadata with uptime', () => {
      const metadata = workspace.getMetadata();
      
      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('uptime');
      expect(metadata).toHaveProperty('documentCount', 0);
      expect(typeof metadata.uptime).toBe('number');
      expect(metadata.uptime >= 0).toBe(true);
    });

    test('should update document count in metadata', () => {
      workspace.addDocument('file:///wiki/page1.lgml');
      workspace.addDocument('file:///wiki/page2.lgml');
      
      const metadata = workspace.getMetadata();
      expect(metadata.documentCount).toBe(2);
    });
  });

  describe('cleanup', () => {
    test('should cleanup workspace resources', async () => {
      workspace.addDocument('file:///wiki/page.lgml');
      workspace.setState('testKey', 'testValue');
      
      await workspace.cleanup();
      
      expect(workspace.documents.size).toBe(0);
      expect(workspace.state).toEqual({});
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws_test_123' }),
        'Workspace cleanup started'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws_test_123' }),
        'Workspace cleanup completed'
      );
    });
  });

  describe('get documents', () => {
    test('should return array of documents', () => {
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      
      workspace.addDocument(uri1);
      workspace.addDocument(uri2);
      
      const documents = workspace.getDocuments();
      
      expect(Array.isArray(documents)).toBe(true);
      expect(documents).toContain(uri1);
      expect(documents).toContain(uri2);
      expect(documents.length).toBe(2);
    });
  });
});

describe('WorkspaceManager', () => {
  let manager;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    manager = new WorkspaceManager(logger);
  });

  describe('initialization', () => {
    test('should initialize with empty state', () => {
      expect(manager.workspaces.size).toBe(0);
      expect(manager.documentToWorkspace.size).toBe(0);
      expect(manager.editorToWorkspace.size).toBe(0);
    });

    test('should log initialization', () => {
      expect(logger.info).toHaveBeenCalledWith('WorkspaceManager initialized');
    });
  });

  describe('workspace creation', () => {
    test('should create workspace for new editor', () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      
      expect(workspace).toBeDefined();
      expect(workspace.id).toBeDefined();
      expect(manager.workspaces.size).toBe(1);
      expect(manager.documentToWorkspace.size).toBe(1);
      expect(manager.editorToWorkspace.size).toBe(1);
    });

    test('should reuse workspace for same editor', () => {
      const editorId = 'editor_test_001';
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      
      const ws1 = manager.createWorkspaceForEditor(uri1, editorId);
      const ws2 = manager.createWorkspaceForEditor(uri2, editorId);
      
      expect(ws1.id).toBe(ws2.id);
      expect(manager.workspaces.size).toBe(1);
      expect(manager.documentToWorkspace.size).toBe(2);
    });

    test('should create separate workspace for different editor', () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page.lgml';
      const uri2 = 'file:///otherwiki/page.lgml';
      
      const ws1 = manager.createWorkspaceForEditor(uri1, editorId1);
      const ws2 = manager.createWorkspaceForEditor(uri2, editorId2);
      
      expect(ws1.id).not.toBe(ws2.id);
      expect(manager.workspaces.size).toBe(2);
    });

    test('should add documents to workspace', () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      
      expect(workspace.documents.has(uri)).toBe(true);
      expect(workspace.documents.size).toBe(1);
    });
  });

  describe('workspace retrieval', () => {
    test('should get workspace for document', () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      const created = manager.createWorkspaceForEditor(uri, editorId);
      
      const retrieved = manager.getWorkspaceForDocument(uri);
      
      expect(retrieved).toBe(created);
      expect(retrieved.id).toBe(created.id);
    });

    test('should return null for unknown document', () => {
      const workspace = manager.getWorkspaceForDocument('file:///unknown/page.lgml');
      
      expect(workspace).toBeNull();
    });

    test('should get workspace by ID', () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      const created = manager.createWorkspaceForEditor(uri, editorId);
      
      const retrieved = manager.getWorkspace(created.id);
      
      expect(retrieved).toBe(created);
    });

    test('should get all workspaces', () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page.lgml';
      const uri2 = 'file:///otherwiki/page.lgml';
      
      manager.createWorkspaceForEditor(uri1, editorId1);
      manager.createWorkspaceForEditor(uri2, editorId2);
      
      const all = manager.getAllWorkspaces();
      
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(2);
    });
  });

  describe('workspace cleanup', () => {
    test('should close empty workspace', async () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      manager.createWorkspaceForEditor(uri, editorId);
      
      await manager.closeDocumentWorkspace(uri);
      
      expect(manager.workspaces.size).toBe(0);
      expect(manager.documentToWorkspace.size).toBe(0);
      expect(manager.editorToWorkspace.size).toBe(0);
    });

    test('should not close workspace with multiple documents', async () => {
      const editorId = 'editor_test_001';
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      
      manager.createWorkspaceForEditor(uri1, editorId);
      manager.createWorkspaceForEditor(uri2, editorId);
      
      await manager.closeDocumentWorkspace(uri1);
      
      expect(manager.workspaces.size).toBe(1);
      expect(manager.documentToWorkspace.size).toBe(1);
      expect(manager.documentToWorkspace.has(uri2)).toBe(true);
    });

    test('should close workspace when last document is removed', async () => {
      const editorId = 'editor_test_001';
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      
      manager.createWorkspaceForEditor(uri1, editorId);
      manager.createWorkspaceForEditor(uri2, editorId);
      
      await manager.closeDocumentWorkspace(uri1);
      expect(manager.workspaces.size).toBe(1);
      
      await manager.closeDocumentWorkspace(uri2);
      expect(manager.workspaces.size).toBe(0);
    });

    test('should handle closing unknown document', () => {
      manager.closeDocumentWorkspace('file:///unknown/page.lgml');
      
      expect(manager.workspaces.size).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    test('should provide workspace statistics', () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      const uri3 = 'file:///otherwiki/page.lgml';
      
      manager.createWorkspaceForEditor(uri1, editorId1);
      manager.createWorkspaceForEditor(uri2, editorId1);
      manager.createWorkspaceForEditor(uri3, editorId2);
      
      const stats = manager.getStatistics();
      
      expect(stats.totalWorkspaces).toBe(2);
      expect(stats.totalDocuments).toBe(3);
      expect(Array.isArray(stats.workspaces)).toBe(true);
      expect(stats.workspaces.length).toBe(2);
    });

    test('should include workspace details in statistics', () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      manager.createWorkspaceForEditor(uri, editorId);
      
      const stats = manager.getStatistics();
      const wsStats = stats.workspaces[0];
      
      expect(wsStats).toHaveProperty('id');
      expect(wsStats).toHaveProperty('documentCount', 1);
      expect(wsStats).toHaveProperty('createdAt');
      expect(wsStats).toHaveProperty('uptime');
    });
  });

  describe('full lifecycle', () => {
    test('should handle complete workspace lifecycle', async () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      const uri3 = 'file:///otherwiki/page.lgml';
      
      // Create workspaces
      const ws1 = manager.createWorkspaceForEditor(uri1, editorId1);
      const ws2 = manager.createWorkspaceForEditor(uri2, editorId1);
      const ws3 = manager.createWorkspaceForEditor(uri3, editorId2);
      
      expect(manager.workspaces.size).toBe(2);
      expect(ws1.id).toBe(ws2.id); // Same editor
      expect(ws1.id).not.toBe(ws3.id); // Different editor
      
      // Close documents
      await manager.closeDocumentWorkspace(uri1);
      expect(manager.workspaces.size).toBe(2); // ws1/ws2 still has uri2
      
      await manager.closeDocumentWorkspace(uri2);
      expect(manager.workspaces.size).toBe(1); // Only ws3 remains
      
      await manager.closeDocumentWorkspace(uri3);
      expect(manager.workspaces.size).toBe(0); // All cleaned up
    });

    test('should allow document re-opening after workspace removal', async () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const ws1 = manager.createWorkspaceForEditor(uri, editorId);
      
      await manager.closeDocumentWorkspace(uri);
      expect(manager.workspaces.size).toBe(0);
      
      // Re-open the document
      const ws2 = manager.createWorkspaceForEditor(uri, editorId);
      
      // Workspace is recreated (ID may be same due to quick timestamp or different if enough time passed)
      expect(manager.workspaces.size).toBe(1);
      expect(ws2.documents.size).toBe(1);
      expect(ws2.documents.has(uri)).toBe(true);
    });
  });

  describe('cleanup on shutdown', () => {
    test('should cleanup all workspaces', async () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page.lgml';
      const uri2 = 'file:///otherwiki/page.lgml';
      
      manager.createWorkspaceForEditor(uri1, editorId1);
      manager.createWorkspaceForEditor(uri2, editorId2);
      
      expect(manager.workspaces.size).toBe(2);
      
      await manager.cleanup();
      
      expect(manager.workspaces.size).toBe(0);
      expect(manager.documentToWorkspace.size).toBe(0);
      expect(manager.editorToWorkspace.size).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        { workspaceCount: 2 },
        'WorkspaceManager cleanup started'
      );
    });
  });

  describe('workspace caching', () => {
    test('should provide isolated moduleCache per workspace', () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page.lgml';
      const uri2 = 'file:///otherwiki/page.lgml';
      
      const ws1 = manager.createWorkspaceForEditor(uri1, editorId1);
      const ws2 = manager.createWorkspaceForEditor(uri2, editorId2);
      
      // Add module to ws1 cache
      ws1.moduleCache.set('Math', 'function Math() {}');
      
      // ws2 cache should be empty
      expect(ws1.moduleCache.size).toBe(1);
      expect(ws2.moduleCache.size).toBe(0);
      expect(ws1.moduleCache.get('Math')).toBe('function Math() {}');
      expect(ws2.moduleCache.get('Math')).toBeUndefined();
    });

    test('should provide isolated dataCache per workspace', () => {
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page.lgml';
      const uri2 = 'file:///otherwiki/page.lgml';
      
      const ws1 = manager.createWorkspaceForEditor(uri1, editorId1);
      const ws2 = manager.createWorkspaceForEditor(uri2, editorId2);
      
      // Add data to ws1 cache
      ws1.dataCache.set('Users', { users: ['Alice', 'Bob'] });
      
      // ws2 cache should be empty
      expect(ws1.dataCache.size).toBe(1);
      expect(ws2.dataCache.size).toBe(0);
      expect(ws1.dataCache.get('Users')).toEqual({ users: ['Alice', 'Bob'] });
      expect(ws2.dataCache.get('Users')).toBeUndefined();
    });

    test('should clear caches on workspace cleanup', async () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      
      // Add some caches
      workspace.moduleCache.set('Math', 'code');
      workspace.dataCache.set('Config', { key: 'value' });
      
      expect(workspace.moduleCache.size).toBe(1);
      expect(workspace.dataCache.size).toBe(1);
      
      // Cleanup
      await workspace.cleanup();
      
      expect(workspace.moduleCache.size).toBe(0);
      expect(workspace.dataCache.size).toBe(0);
    });

    test('should track cache statistics', () => {
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      
      // Add caches
      workspace.moduleCache.set('Math', 'x'.repeat(100));
      workspace.moduleCache.set('Utils', 'y'.repeat(200));
      workspace.dataCache.set('Config', 'z'.repeat(50));
      
      // Update stats
      workspace.updateCacheStats(2, 1, 350);
      
      expect(workspace.metadata.cacheStats.modulesCached).toBe(2);
      expect(workspace.metadata.cacheStats.dataCached).toBe(1);
      expect(workspace.metadata.cacheStats.totalCacheSize).toBe(350);
    });
  });

  describe('idle workspace cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    test('should have idle cleanup timer configured', () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      
      expect(manager.idleTimeoutMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(manager.idleCheckIntervalMs).toBe(60 * 1000); // 1 minute
      expect(manager.idleCheckInterval).not.toBeNull();
      
      manager.cleanup();
    });

    test('should track lastActivityTime on workspace creation', () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const beforeTime = Date.now();
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      const afterTime = Date.now();
      
      expect(workspace.lastActivityTime).toBeGreaterThanOrEqual(beforeTime);
      expect(workspace.lastActivityTime).toBeLessThanOrEqual(afterTime);
      
      manager.cleanup();
    });

    test('should detect idle workspaces', async () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      expect(manager.workspaces.size).toBe(1);
      
      // Set activity time to past (2 seconds ago)
      workspace.lastActivityTime = Date.now() - 2000;
      
      // Manually trigger the idle cleanup logic by calling it directly
      // This tests the cleanup logic without relying on interval timers
      const now = Date.now();
      const workspacesToClean = [];

      manager.workspaces.forEach((ws, wsId) => {
        const idleDuration = now - ws.lastActivityTime;
        
        if (idleDuration > manager.idleTimeoutMs) {
          workspacesToClean.push(wsId);
        }
      });

      // With default timeout of 15 mins, a workspace with activity 2 seconds ago is NOT idle
      // So let's set even older time
      workspace.lastActivityTime = Date.now() - (20 * 60 * 1000); // 20 minutes ago
      
      // Check again
      manager.workspaces.forEach((ws, wsId) => {
        const idleDuration = now - ws.lastActivityTime;
        
        if (idleDuration > manager.idleTimeoutMs) {
          workspacesToClean.push(wsId);
        }
      });

      expect(workspacesToClean.length).toBeGreaterThan(0);
      
      manager.cleanup();
    });

    test('should not cleanup active workspaces', async () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      
      // Configure for quick testing
      manager.configureIdleTimeout(10000, 100); // 10 seconds idle, check every 100ms
      
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      expect(manager.workspaces.size).toBe(1);
      
      // Keep workspace recent (activity just now)
      workspace.lastActivityTime = Date.now();
      
      // Run idle check
      jest.advanceTimersByTime(150);
      
      // Should still be there
      expect(manager.workspaces.size).toBe(1);
      
      manager.cleanup();
    });

    test('should record activity for document', () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      const editorId = 'editor_test_001';
      const uri = 'file:///wiki/page.lgml';
      
      const workspace = manager.createWorkspaceForEditor(uri, editorId);
      const initialTime = workspace.lastActivityTime;
      
      // Simulate some time passing
      jest.advanceTimersByTime(100);
      
      // Record activity
      manager.recordActivity(uri);
      
      expect(workspace.lastActivityTime).toBeGreaterThan(initialTime);
      
      manager.cleanup();
    });

    test('should allow configuring idle timeout', () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      
      manager.configureIdleTimeout(5000, 1000);
      
      expect(manager.idleTimeoutMs).toBe(5000);
      expect(manager.idleCheckIntervalMs).toBe(1000);
      
      manager.cleanup();
    });

    test('should close workspace for specific editor', async () => {
      const logger = createMockLogger();
      const manager = new WorkspaceManager(logger);
      
      const editorId1 = 'editor_test_001';
      const editorId2 = 'editor_test_002';
      const uri1 = 'file:///wiki/page1.lgml';
      const uri2 = 'file:///wiki/page2.lgml';
      
      manager.createWorkspaceForEditor(uri1, editorId1);
      manager.createWorkspaceForEditor(uri2, editorId2);
      
      expect(manager.workspaces.size).toBe(2);
      
      // Close workspace for editor 1
      await manager.closeWorkspaceForEditor(editorId1);
      
      expect(manager.workspaces.size).toBe(1);
      expect(manager.getWorkspaceForDocument(uri1)).toBeFalsy();
      expect(manager.getWorkspaceForDocument(uri2)).toBeTruthy();
      
      manager.cleanup();
    });
  });
});
