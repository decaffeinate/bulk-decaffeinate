/**
 * Script that fixes import styles to properly match the export style of the
 * file being imported. Since decaffeinate doesn't do whole-codebase analysis,
 * we need to do this as a follow-up step.
 *
 * Note that this conversion runs on ALL project files (or, at least, any files
 * that could import a converted file). In general, it can handle any import
 * statement, read the exports of the file being imported, and adjust the import
 * usage to properly use the named/default exports as necessary.
 *
 * See the test examples starting with "fix-imports" for lots of examples.
 *
 * The script is quite thorough and mostly correct, but it can fail in the case
 * of variable shadowing, dynamic usages of a default import or an import *
 * object, or code that depends on the "live binding" behavior of imports, and
 * likely other subtle cases.
 *
 * See https://github.com/decaffeinate/decaffeinate/issues/402 for some more
 * details on why decaffeinate can't solve this itself.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export default function (fileInfo, api, options) {
  let decodedOptions = JSON.parse(new Buffer(options['encoded-options'], 'base64'));
  let {convertedFiles, absoluteImportPaths} = decodedOptions;
  let j = api.jscodeshift;
  let thisFilePath = path.resolve(fileInfo.path);
  let root = j(fileInfo.source);

  function convertFile() {
    if (includes(convertedFiles, thisFilePath)) {
      return fixImportsForConvertedFile();
    } else {
      return fixImportsForOtherFile();
    }
  }

  /**
   * This file was just converted to JS, so ANY import has the potential to be
   * invalid.
   */
  function fixImportsForConvertedFile() {
    return root
      .find(j.ImportDeclaration)
      .replaceWith(fixImportAtPath)
      .toSource();
  }

  /**
   * This file was not just converted to JS, but could potentially import files
   * that were. Correct any of those imports.
   */
  function fixImportsForOtherFile() {
    return root
      .find(j.ImportDeclaration)
      .filter(path => {
        let importPath = resolveImportPath(thisFilePath, path.node.source.value);
        return includes(convertedFiles, importPath);
      })
      .replaceWith(fixImportAtPath)
      .toSource();
  }

  /**
   * Top-level import-fixing code. We get all relevant information about the
   * names being imported and the names exported by the other file, and then
   * produce a set of changes on the import statement, including possibly some
   * destructure operations after the import.
   */
  function fixImportAtPath(path) {
    let importPath = path.node.source.value;
    let resolvedPath = resolveImportPath(thisFilePath, importPath);
    if (resolvedPath === null) {
      return path.node;
    }
    let exportsInfo = getExportsInformation(resolvedPath);
    let specifierIndex = getSpecifierIndex(path);
    let memberAccesses = findAllMemberAccesses(specifierIndex);
    let importManifest = getImportManifest(exportsInfo, memberAccesses);

    // If any sort of property is accessed from the default import, we need it.
    // Also, the default import might be something like a function where we
    // imported it and the other module has a default export.
    let needsDefaultImport =
      importManifest.defaultImportDirectAccesses.length > 0 ||
      importManifest.defaultImportObjectAccesses.length > 0 ||
      (exportsInfo.hasDefaultExport && specifierIndex.defaultImport !== null);

    // If there are object-style accesses of named imports
    // (e.g. MyModule.myExport), then handle those with a star import. If we
    // also have direct usages of named exports (e.g. myOtherExport), we'll need
    // to destructure them from the * import later, but we try to avoid that
    // when possible.
    let needsStarImport = importManifest.namedImportObjectAccesses.length > 0;

    let {defaultImportName, starImportName} = resolveImportObjectNames(
      specifierIndex, needsDefaultImport, needsStarImport,
      exportsInfo.hasDefaultExport, importPath);

    path.node.specifiers = createImportSpecifiers(
      defaultImportName, starImportName, specifierIndex, importManifest);

    renameObjectAccesses(defaultImportName, starImportName, importManifest);

    if (importManifest.defaultImportDirectAccesses.length > 0) {
      insertImportDestructure(
        path, importManifest.defaultImportDirectAccesses, specifierIndex, defaultImportName);
    }
    // If we don't have a star import, named imports were done in the import statement.
    // Otherwise, we need to destructure from the star import to get direct names from it.
    if (starImportName !== null && importManifest.namedImportDirectAccesses.length > 0) {
      insertImportDestructure(path, importManifest.namedImportDirectAccesses, specifierIndex, starImportName);
    }
    return path.node;
  }

  /**
   * Turn an import string into an absolute path to a JS file.
   */
  function resolveImportPath(importingFilePath, importPath) {
    if (!importPath.endsWith('.js')) {
      importPath += '.js';
    }
    let currentDir = path.dirname(importingFilePath);
    let relativePath = path.resolve(currentDir, importPath);
    if (existsSync(relativePath)) {
      return relativePath;
    }
    for (let absoluteImportPath of absoluteImportPaths) {
      let absolutePath = path.resolve(absoluteImportPath, importPath);
      if (existsSync(absolutePath)) {
        return absolutePath;
      }
    }
    return null;
  }

  /**
   * Determine the names of all exports provided by a module and whether or not
   * it has a default export.
   */
  function getExportsInformation(filePath) {
    let source = readFileSync(filePath).toString();
    let root = j(source);

    let hasDefaultExport = false;
    let namedExports = [];
    root.find(j.ExportNamedDeclaration)
      .forEach(p => {
        for (let specifier of p.node.specifiers) {
          namedExports.push(specifier.exported.name);
        }
        if (p.node.declaration) {
          if (p.node.declaration.declarations) {
            for (let declaration of p.node.declaration.declarations) {
              namedExports.push(declaration.id.name);
            }
          }
          if (p.node.declaration.id) {
            namedExports.push(p.node.declaration.id);
          }
        }
      });

    root.find(j.ExportDefaultDeclaration)
      .forEach(() => {hasDefaultExport = true;});

    root.find(j.ExportAllDeclaration)
      .forEach(p => {
        let otherFilePath = resolveImportPath(filePath, p.node.source.value);
        if (otherFilePath === null) {
          return;
        }
        let otherFileExports = getExportsInformation(otherFilePath);
        for (let namedExport of otherFileExports.namedExports) {
          namedExports.push(namedExport);
        }
      });
    return {hasDefaultExport, namedExports};
  }

  /**
   * Return an object that makes it more convenient to look up import specifiers
   * rather than having to loop through the array.
   */
  function getSpecifierIndex(path) {
    let defaultImport = null;
    let starImport = null;
    let namedImportsByImportedName = new Map();
    for (let specifier of path.node.specifiers) {
      if (specifier.type === 'ImportDefaultSpecifier') {
        defaultImport = specifier;
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        starImport = specifier;
      } else if (specifier.type === 'ImportSpecifier') {
        namedImportsByImportedName.set(specifier.imported.name, specifier);
      }
    }
    return {
      defaultImport,
      starImport,
      namedImportsByImportedName,
    };
  }

  /**
   * Figure out what values are accessed from this import, including attributes
   * pulled off of the default or star imports.
   */
  function findAllMemberAccesses(specifierIndex) {
    let defaultImportAccesses = [];
    let starImportAccesses = [];
    let directAccesses = [];
    if (specifierIndex.defaultImport !== null) {
      let name = specifierIndex.defaultImport.local.name;
      defaultImportAccesses.push(...getMemberAccessesForName(name));
    }
    if (specifierIndex.starImport !== null) {
      let name = specifierIndex.starImport.local.name;
      starImportAccesses.push(...getMemberAccessesForName(name));
    }
    for (let specifier of specifierIndex.namedImportsByImportedName.values()) {
      directAccesses.push(specifier.imported.name);
    }
    return {
      defaultImportAccesses,
      starImportAccesses,
      directAccesses
    };
  }

  /**
   * Given a name, find all cases in the code where a field is accessed from
   * that name. For example, if objectName is Foo and the code contains Foo.a,
   * Foo.b, and Foo.c, return the set {'a', 'b', 'c'}.
   */
  function getMemberAccessesForName(objectName) {
    let membersAccessed = new Set();
    root
      .find(j.MemberExpression, {
        object: {
          name: objectName
        }
      })
      .forEach(path => {
        if (path.node.property.type === 'Identifier') {
          membersAccessed.add(path.node.property.name);
        }
      });
    return membersAccessed;
  }

  /**
   * Figure out what types of imports are needed in the resulting code based on
   * what names are actually used and what names are exported by the other
   * module.
   */
  function getImportManifest(exportsInfo, memberAccesses) {
    let defaultImportDirectAccesses = [];
    let defaultImportObjectAccesses = [];
    let namedImportDirectAccesses = [];
    let namedImportObjectAccesses = [];

    let exportedNames = new Set(exportsInfo.namedExports);
    for (let name of memberAccesses.defaultImportAccesses) {
      if (exportedNames.has(name)) {
        namedImportObjectAccesses.push(name);
      } else {
        defaultImportObjectAccesses.push(name);
      }
    }
    for (let name of memberAccesses.starImportAccesses) {
      if (exportedNames.has(name)) {
        namedImportObjectAccesses.push(name);
      } else {
        defaultImportObjectAccesses.push(name);
      }
    }
    for (let name of memberAccesses.directAccesses) {
      if (exportedNames.has(name)) {
        namedImportDirectAccesses.push(name);
      } else {
        defaultImportDirectAccesses.push(name);
      }
    }
    return {
      defaultImportDirectAccesses,
      defaultImportObjectAccesses,
      namedImportDirectAccesses,
      namedImportObjectAccesses,
    };
  }

  /**
   * Figure out what names to use for the default import and the import *
   * values, based on the existing names (if any) and which ones we actually
   * need.
   */
  function resolveImportObjectNames(
      specifierIndex, needsDefaultImport, needsStarImport, hasDefaultExport, importPath) {
    let existingDefaultImportName =
      specifierIndex.defaultImport && specifierIndex.defaultImport.local.name;
    let existingStarImportName =
      specifierIndex.starImport && specifierIndex.starImport.local.name;

    let defaultImportName = null;
    let starImportName = null;

    if ((!needsDefaultImport || existingDefaultImportName !== null) &&
        (!needsStarImport || existingStarImportName !== null)) {
      // If we already have all the names we need, then no name-generation required!
      // Just use them.
      if (needsDefaultImport) {
        defaultImportName = existingDefaultImportName;
      }
      if (needsStarImport) {
        starImportName = existingStarImportName;
      }
    } else if (needsDefaultImport && hasDefaultExport && existingDefaultImportName !== null) {
      // If we potentially use the default import for anything other than object
      // accesses, then we prefer to keep the name as-is, so special-case that.
      defaultImportName = existingDefaultImportName;
      if (needsStarImport) {
        starImportName = findFreeName(defaultImportName + 'Exports');
      }
    } else if (needsDefaultImport) {
      // Otherwise, we need to fill in at least one name and there aren't any
      // specific constraints that we have to follow. Give the default import
      // naming priority. If we also need a star import, give it a name based
      // on our default name.
      if (existingDefaultImportName !== null) {
        defaultImportName = existingDefaultImportName;
      } else if (existingStarImportName !== null && !needsStarImport) {
        defaultImportName = existingStarImportName;
      } else if (existingStarImportName !== null && needsStarImport) {
        defaultImportName = findFreeName(existingStarImportName + 'Default');
      } else {
        defaultImportName = findFreeName(inferNameFromImportPath(importPath));
      }
      if (needsStarImport) {
        if (existingStarImportName !== null) {
          starImportName = existingStarImportName;
        } else {
          starImportName = findFreeName(defaultImportName + 'Exports');
        }
      }
    } else if (needsStarImport) {
      // Otherwise, we might need a star import name but no default import name.
      // Try using the existing name or stealing from the default name if
      // possible. If not, come up with a new name from the path.
      if (existingStarImportName !== null) {
        starImportName = existingStarImportName;
      } else if (existingDefaultImportName !== null) {
        starImportName = existingDefaultImportName;
      } else {
        starImportName = findFreeName(inferNameFromImportPath(importPath));
      }
    }

    return {defaultImportName, starImportName};
  }

  /**
   * Guess a nice capitalized camelCase name from a filename on an import. For
   * example, './util/dashed-name' becomes 'DashedName'.
   */
  function inferNameFromImportPath(importPath) {
    let lastSlashIndex = importPath.lastIndexOf('/');
    let filename = importPath;
    if (lastSlashIndex > -1) {
      filename = filename.substr(lastSlashIndex + 1);
    }
    if (filename.endsWith('.js')) {
      filename = filename.substr(0, filename.length - 3);
    }
    return camelCaseName(filename);
  }

  /**
   * Convert the given string to a capitalized camelCase name.
   *
   * Somewhat based on this discussion:
   * http://stackoverflow.com/questions/2970525/converting-any-string-into-camel-case
   */
  function camelCaseName(name) {
    return name
      .replace(/(^|[ \-_])(.)/g, match => match.toUpperCase())
      .replace(/[ \-_]/g, '');
  }

  /**
   * Find a variable name that is unused in the code to avoid name clashes with
   * existing names.
   */
  function findFreeName(desiredName) {
    if (!isNameTaken(desiredName)) {
      return desiredName;
    }
    for (let i = 1; i < 5000; i++) {
      let name = `${desiredName}${i}`;
      if (!isNameTaken(name)) {
        return name;
      }
    }
    throw new Error('Could not find a suitable name.');
  }

  function isNameTaken(desiredName) {
    return root.find(j.Identifier, {name: desiredName}).size() > 0;
  }

  /**
   * Create the direct contents of the import statement. This may include a
   * default import, a star import, and/or a list of named imports. Note that
   * we are now allowed to have both a star import and named imports, so if we
   * need both, we do a star import and will destructure it later.
   */
  function createImportSpecifiers(
      defaultImportName, starImportName, specifierIndex, importManifest) {
    let specifiers = [];
    if (defaultImportName) {
      if (specifierIndex.defaultImport !== null) {
        specifiers.push(specifierIndex.defaultImport);
      } else {
        specifiers.push(j.importDefaultSpecifier(j.identifier(defaultImportName)));
      }
    }
    if (starImportName) {
      if (specifierIndex.starImport !== null) {
        specifiers.push(specifierIndex.starImport);
      } else {
        specifiers.push(j.importNamespaceSpecifier(j.identifier(starImportName)));
      }
    }
    // If we don't have a star import, named imports can go directly in the
    // import statement. Otherwise we'll need to destructure them from the star
    // import later.
    if (!starImportName) {
      for (let importName of importManifest.namedImportDirectAccesses) {
        specifiers.push(specifierIndex.namedImportsByImportedName.get(importName));
      }
    }
    return specifiers;
  }

  /**
   * Do a rename operation to handle object-style accesses. For example, if we
   * have the import line `import Foo, * as FooExports from './Foo';` and a line
   * in the code is `Foo.bar`, but `bar` is a named export on the foo module, we
   * need to rename the reference in the code to `FooExports.bar`.
   */
  function renameObjectAccesses(defaultImportName, starImportName, importManifest) {
    let defaultImportProperties = new Set(importManifest.defaultImportObjectAccesses);
    let starImportProperties = new Set(importManifest.namedImportObjectAccesses);
    root
      .find(j.MemberExpression)
      .replaceWith(path => {
        let {object, property} = path.node;
        if (object.type !== 'Identifier' ||
            (object.name !== defaultImportName && object.name !== starImportName) ||
            property.type !== 'Identifier') {
          return path.node;
        }
        if (defaultImportProperties.has(property.name)) {
          object.name = defaultImportName;
        }
        if (starImportProperties.has(property.name)) {
          object.name = starImportName;
        }
        return path.node;
      });
  }

  /**
   * Create a destructure statement after the import statement. This is a way
   * to simulate named imports for default imports and star imports.
   */
  function insertImportDestructure(path, importNames, specifierIndex, importName) {
    let destructureFields = importNames.map(
      importName => {
        let specifier = specifierIndex.namedImportsByImportedName.get(importName);
        return {
          accessName: specifier.imported.name,
          boundName: specifier.local.name,
        };
      }
    );
    path.insertAfter(makeDestructureStatement(destructureFields, importName));
  }

  function makeDestructureStatement(destructureFields, objName) {
    let properties = destructureFields.map(({accessName, boundName}) => {
      let property = j.property(
        'init',
        j.identifier(accessName),
        j.identifier(boundName)
      );
      if (accessName === boundName) {
        property.shorthand = true;
      }
      return property;
    });
    return j.variableDeclaration(
      'const',
      [
        j.variableDeclarator(
          j.objectPattern(properties),
          j.identifier(objName)
        )
      ]
    );
  }

  return convertFile();
}

/**
 * Little helper since we don't have Array.prototype.includes.
 */
function includes(arr, elem) {
  return arr.indexOf(elem) > -1;
}
