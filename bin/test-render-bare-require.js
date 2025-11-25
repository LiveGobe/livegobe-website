const { renderWikiText } = require('./wiki-renderer');

async function run() {
  // Setup options where getPage resolves Module:TestModule and Module:Characters/data
  const options = {
    wikiName: 'test-wiki',
    pageName: 'SomePage',
    currentNamespace: 'Main',
    getPage: async (kind, name) => {
      if (kind === 'Module' && name === 'BareTestModule') {
        return { content: `const Data = await require("Characters/data"); module.exports.hello = async function() { return 'BAREOK:' + Data.testValue; }` };
      }
      if (kind === 'Module' && name === 'Characters/data') {
        return { content: `module.exports = { testValue: 'ok' };` };
      }
      return null;
    }
  };

  const input = '{{#invoke:BareTestModule|hello}}';
  const { html } = await renderWikiText(input, options);
  console.log('Rendered HTML (bare require):', html);
}

run().catch(e => console.error(e));
