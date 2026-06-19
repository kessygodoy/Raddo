import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();

function parse(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function propertyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return '';
}

function findVariableObject(source, variableName) {
  let result;
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName) continue;
      if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) result = declaration.initializer;
    }
  });
  return result;
}

function objectKeys(object) {
  return new Set(
    object.properties
      .filter((property) => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      .map((property) => propertyName(property.name))
      .filter(Boolean),
  );
}

function localeObject(parent, locale) {
  const property = parent.properties.find(
    (item) => ts.isPropertyAssignment(item) && propertyName(item.name) === locale && ts.isObjectLiteralExpression(item.initializer),
  );
  return property?.initializer;
}

function compare(label, expected, actual, errors) {
  const missing = [...expected].filter((key) => !actual.has(key));
  const extra = [...actual].filter((key) => !expected.has(key));
  if (missing.length) errors.push(`${label}: faltando ${missing.join(', ')}`);
  if (extra.length) errors.push(`${label}: extras ${extra.join(', ')}`);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const errors = [];
const main = parse('src/i18n.tsx');
const dictionaries = findVariableObject(main, 'dictionaries');
const legacyLocales = ['pt-BR', 'en-US', 'es'];
const legacyKeys = {};
for (const locale of legacyLocales) {
  legacyKeys[locale] = objectKeys(localeObject(dictionaries, locale));
}
compare('en-US (base)', legacyKeys['pt-BR'], legacyKeys['en-US'], errors);
compare('es (base)', legacyKeys['pt-BR'], legacyKeys.es, errors);

const asian = parse('src/i18nAsian.ts');
for (const [variable, locale] of [['zhCNDictionary', 'zh-CN'], ['hiINDictionary', 'hi-IN']]) {
  compare(`${locale} (base)`, legacyKeys['pt-BR'], objectKeys(findVariableObject(asian, variable)), errors);
}

const ui = parse('src/i18nUi.ts');
const uiDictionaries = findVariableObject(ui, 'uiDictionaries');
const uiBase = objectKeys(localeObject(uiDictionaries, 'pt-BR'));
for (const locale of ['en-US', 'es', 'zh-CN', 'hi-IN']) {
  compare(`${locale} (UI)`, uiBase, objectKeys(localeObject(uiDictionaries, locale)), errors);
}

const knownKeys = new Set([...legacyKeys['pt-BR'], ...uiBase]);
const usedLiteralKeys = new Set();
for (const file of sourceFiles(path.join(root, 'src'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      usedLiteralKeys.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const unknown = [...usedLiteralKeys].filter((key) => !knownKeys.has(key));
if (unknown.length) errors.push(`Chaves usadas sem tradução: ${unknown.join(', ')}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`i18n OK: ${knownKeys.size} chaves em 5 idiomas; ${usedLiteralKeys.size} chaves literais em uso.`);
