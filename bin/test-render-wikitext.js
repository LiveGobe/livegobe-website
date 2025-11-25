const { renderWikiText } = require('./wiki-renderer');

async function run() {
  // Setup options where getPage resolves Module:TestModule
  const options = {
    wikiName: 'test-wiki',
    pageName: 'SomePage',
    currentNamespace: 'Main',
    getPage: async (kind, name) => {
      if (kind === 'Module' && name === 'TestModule') {
        return { content: "module.exports.hello = async function() { return 'Hello via renderWikiText'; }" };
      }
      return null;
    }
  };

  const input = '{{#invoke:TestModule|hello}}';
  const { html } = await renderWikiText(input, options);
  console.log('Rendered HTML:', html);
}

run().catch(e => console.error(e));
