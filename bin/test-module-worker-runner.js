const path = require('path');
const { Worker } = require('worker_threads');

const workerPath = path.join(__dirname, 'module-worker.js');

async function runTest() {
  return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: {
          moduleName: 'TestModule',
          functionName: 'hello',
          args: [],
          code: `module.exports.hello = async function() { return 'Hello from worker'; }`,
          options: { wikiName: 'test-wiki', currentNamespace: 'Main', depth: 0, _maxDepth: 10 }
        }
      });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Timeout')); 
    }, 3000);

    worker.on('message', (m) => {
      if (m.type === 'result') { clearTimeout(timer); resolve(m.result); }
      else if (m.type === 'error') { clearTimeout(timer); reject(new Error(m.error)); }
      else if (m.type === 'getPage') {
        // For this simple module we don't expect getPage message, but we respond gracefully
        worker.postMessage({ type: 'getPageResponse', id: m.id, content: null });
      }
    });
    worker.on('error', (e)=>{ clearTimeout(timer); reject(e); });
    worker.on('exit', (code) => { clearTimeout(timer); console.log('Worker exited with code', code); });
  });
}

runTest().then(res => {
  console.log('Result:', res);
}).catch(err => {
  console.error('Error:', err);
});

// test disallowed 'eval' usage (should be rejected by AST check)
function runEvalTest() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        moduleName: 'EvilModule',
        functionName: 'hello',
        args: [],
        code: `module.exports.hello = function() { return eval('2+2'); }`,
        options: { wikiName: 'test-wiki', currentNamespace: 'Main', depth: 0, _maxDepth: 10 }
      }
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Timeout')); }, 3000);
    worker.on('message', (m) => { console.log('worker message:', m); if (m.type === 'result') { clearTimeout(timer); resolve(m.result); } else if (m.type === 'error') { clearTimeout(timer); reject(new Error(m.error)); } else if (m.type === 'getPage') { worker.postMessage({ type: 'getPageResponse', id: m.id, content: null }); } });
    worker.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

runEvalTest().then(res => {
  console.log('Eval test result:', res);
}).catch(err => {
  console.error('Eval test Error:', err);
});
