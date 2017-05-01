const COFFEE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];

export function coffeePathPredicate(path) {
  return COFFEE_EXTENSIONS.some(ext =>
  path.endsWith(ext) && !path.endsWith(`.original${ext}`));
}

export function backupPathFor(path) {
  for (let ext of COFFEE_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return path.slice(0, path.length - ext.length) + '.original' + ext;
    }
  }
  return path + '.original';
}

export function jsPathFor(path) {
  for (let ext of COFFEE_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return path.slice(0, path.length - ext.length) + '.js';
    }
  }
  return path + '.js';
}

export function isLiterate(path) {
  return path.endsWith('.litcoffee') || path.endsWith('.coffee.md');
}
