import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const requirement = packageJson.engines?.node;
const minimumMatch = typeof requirement === 'string' && /^>=(\d+)\.(\d+)\.(\d+)$/.exec(requirement);

if (!minimumMatch) {
  console.error(
    `[cdr-pim] No se puede validar engines.node=${JSON.stringify(requirement)}. ` +
      'Usa el formato >=MAJOR.MINOR.PATCH.',
  );
  process.exit(1);
}

const minimum = minimumMatch.slice(1).map(Number);
const current = process.versions.node.split('.').map(Number);
const differenceIndex = minimum.findIndex((part, index) => (current[index] ?? 0) !== part);
const compatible =
  differenceIndex === -1 || (current[differenceIndex] ?? 0) > minimum[differenceIndex];

if (!compatible) {
  console.error(
    `\n[cdr-pim] Node ${process.versions.node} no es compatible; se requiere ${requirement}.\n` +
      'Ejecuta `nvm use` (lee .nvmrc) o activa la versión declarada en .node-version antes de continuar.\n',
  );
  process.exit(1);
}

console.log(`[cdr-pim] Node ${process.versions.node} compatible con ${requirement}.`);
