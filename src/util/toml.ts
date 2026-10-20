/**
 * Tiny TOML reader covering the subset that appears in `pyproject.toml` and
 * `Cargo.toml`: tables, dotted table headers, string/integer/boolean values,
 * single line and multi line arrays. Inline tables are parsed shallowly.
 *
 * It exists so the tool keeps zero runtime dependencies.
 */

export type TomlValue = string | number | boolean | TomlValue[] | { [key: string]: TomlValue };

function stripComment(line: string): string {
  let inString = false;
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '#') return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw: string): TomlValue {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseArray(value);
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    return parseInlineTable(value);
  }
  return value;
}

function splitArrayItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let quote = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] ?? '';
    if (inString) {
      current += ch;
      if (ch === '\\') {
        current += body[i + 1] ?? '';
        i++;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      items.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(current);
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

function parseArray(raw: string): TomlValue[] {
  return splitArrayItems(raw.slice(1, -1)).map((item) => parseScalar(item));
}

function parseInlineTable(raw: string): { [key: string]: TomlValue } {
  const result: { [key: string]: TomlValue } = {};
  const body = raw.slice(1, -1);
  for (const part of splitArrayItems(body)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    result[key] = parseScalar(part.slice(eq + 1));
  }
  return result;
}

function assign(target: Record<string, TomlValue>, path: string[], value: TomlValue): void {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] as string;
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      const created: Record<string, TomlValue> = {};
      cursor[key] = created;
      cursor = created;
    } else {
      cursor = next as Record<string, TomlValue>;
    }
  }
  const last = path[path.length - 1];
  if (last === undefined) return;
  cursor[last] = value;
}

export function parseToml(text: string): Record<string, TomlValue> {
  const root: Record<string, TomlValue> = {};
  let currentPath: string[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let line = stripComment(lines[i] ?? '').trim();
    if (!line) continue;

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const name = line.slice(2, -2).trim();
      currentPath = name.split('.').map((part) => part.replace(/^["']|["']$/g, ''));
      const parent = currentPath.slice(0, -1);
      const key = currentPath[currentPath.length - 1] as string;
      let container: Record<string, TomlValue> = root;
      for (const part of parent) {
        const next = container[part];
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
          const created: Record<string, TomlValue> = {};
          container[part] = created;
          container = created;
        } else {
          container = next as Record<string, TomlValue>;
        }
      }
      const existing = container[key];
      const list = Array.isArray(existing) ? existing : [];
      const entry: Record<string, TomlValue> = {};
      list.push(entry);
      container[key] = list;
      currentPath = [...parent, `${key}.__entry${list.length - 1}`];
      // Array of tables: subsequent keys go into the last entry.
      currentPath = [...parent, key];
      (container as Record<string, TomlValue>).__lastArrayEntry = entry;
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.slice(1, -1).trim();
      currentPath = name.split('.').map((part) => part.replace(/^["']|["']$/g, ''));
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    let raw = line.slice(eq + 1).trim();

    // Multi line array.
    if (raw.startsWith('[') && !raw.includes(']')) {
      const buffer = [raw];
      while (i + 1 < lines.length) {
        i++;
        const nextLine = stripComment(lines[i] ?? '').trim();
        buffer.push(nextLine);
        if (nextLine.includes(']')) break;
      }
      raw = buffer.join(' ').replace(/\]\s*$/, ']');
    }

    const parent = root;
    if (currentPath.length > 0) {
      const container = parent;
      let cursor: Record<string, TomlValue> = container;
      let isArrayTable = false;
      for (const part of currentPath) {
        const next = cursor[part];
        if (Array.isArray(next)) {
          const last = next[next.length - 1];
          if (last && typeof last === 'object' && !Array.isArray(last)) {
            cursor = last as Record<string, TomlValue>;
            isArrayTable = true;
            continue;
          }
        }
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
          const created: Record<string, TomlValue> = {};
          cursor[part] = created;
          cursor = created;
        } else {
          cursor = next as Record<string, TomlValue>;
        }
      }
      if (isArrayTable) {
        cursor[key] = parseScalar(raw);
        continue;
      }
    }

    assign(parent, [...currentPath, key], parseScalar(raw));
  }

  return root;
}

/** Read a dotted path out of a parsed TOML document. */
export function tomlGet(doc: Record<string, TomlValue>, path: string): TomlValue | undefined {
  let cursor: TomlValue | undefined = doc;
  for (const part of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, TomlValue>)[part];
  }
  return cursor;
}

/** Read a dotted path expecting a string. */
export function tomlString(doc: Record<string, TomlValue>, path: string): string | undefined {
  const value = tomlGet(doc, path);
  return typeof value === 'string' ? value : undefined;
}

/** Read a dotted path expecting an array of strings. */
export function tomlStringArray(doc: Record<string, TomlValue>, path: string): string[] {
  const value = tomlGet(doc, path);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}
