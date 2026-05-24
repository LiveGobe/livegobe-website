/**
 * Unit tests for Virtual Document Generator
 */

const { createVirtualDocumentGenerator, mapLineToOriginal, mapLineToVirtual } = require('../../src/utils/virtual-doc');

describe('VirtualDocumentGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = createVirtualDocumentGenerator({});
  });

  describe('generate()', () => {
    it('should wrap code in IIFE', () => {
      const code = 'var x = 5;';
      const result = generator.generate(code, {}, []);

      expect(result.code).toContain('(async function()');
      expect(result.code).toContain('var x = 5;');
      expect(result.code).toContain('})()');
    });

    it('should inject module dependencies', () => {
      const code = 'var x = require("Module:Items");';
      const modules = {
        "wiki:///Module:Items": 'exports.x = 5;'
      };
      const result = generator.generate(code, modules, []);

      expect(result.code).toContain('var __mod_Items');
      expect(result.code).toContain('exports.x = 5;');
    });

    it('should track line offsets', () => {
      const code = 'var x = 5;';
      const modules = {
        "wiki:///Module:Items": 'exports.x = 5;',
        "wiki:///Module:Other": 'exports.y = 10;'
      };
      const result = generator.generate(code, modules, []);

      expect(result.lineOffset).toBeGreaterThan(0);
      expect(typeof result.lineOffset).toBe('number');
    });

    it('should handle empty modules', () => {
      const code = 'var x = 5;';
      const result = generator.generate(code, {}, []);

      expect(result.code).toContain('var x = 5;');
      expect(result.lineOffset).toBeGreaterThan(0);
    });

    it('should handle multi-line code', () => {
      const code = 'var x = 5;\nvar y = 10;\nreturn x + y;';
      const result = generator.generate(code, {}, []);

      expect(result.code).toContain('var x = 5;');
      expect(result.code).toContain('var y = 10;');
      expect(result.code).toContain('return x + y;');
    });
  });

  describe('mapLineToOriginal()', () => {
    it('should map virtual line to original line', () => {
      const code = 'var x = 5;';
      const { lineOffset } = generator.generate(code, {}, []);

      const virtualLine = lineOffset + 2;
      const originalLine = generator.mapLineToOriginal(virtualLine, lineOffset);

      expect(originalLine).toBe(2);
    });

    it('should handle line offset calculations', () => {
      const code = 'var x = 5;\nvar y = 10;';
      const modules = {
        "wiki:///Module:Items": 'exports.x = 5;\nexports.y = 10;'
      };
      const { lineOffset } = generator.generate(code, modules, []);

      const virtualLine = lineOffset + 5;
      const originalLine = generator.mapLineToOriginal(virtualLine, lineOffset);

      expect(originalLine).toBe(5);
    });
  });

  describe('mapLineToVirtual()', () => {
    it('should map original line to virtual line', () => {
      const code = 'var x = 5;';
      const { lineOffset } = generator.generate(code, {}, []);

      const originalLine = 2;
      const virtualLine = generator.mapLineToVirtual(originalLine, lineOffset);

      expect(virtualLine).toBe(lineOffset + 2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty code', () => {
      const result = generator.generate('', {}, []);

      expect(result.code).toContain('(async function()');
      expect(result.lineOffset).toBeGreaterThan(0);
    });

    it('should escape special characters in module content', () => {
      const code = 'var x = 5;';
      const modules = {
        "wiki:///Module:Items": "exports.str = 'with\\'quotes';"
      };
      const result = generator.generate(code, modules, []);

      // Should not throw
      expect(result.code).toBeDefined();
    });

    it('should handle very large modules', () => {
      const code = 'var x = 5;';
      const largeContent = 'exports.data = ' + JSON.stringify({
        items: Array(100).fill({ id: 1, name: 'test' })
      });
      const modules = {
        "wiki:///Module:Large": largeContent
      };

      const result = generator.generate(code, modules, []);
      expect(result.code).toBeDefined();
      expect(result.lineOffset).toBeGreaterThan(0);
    });
  });
});
