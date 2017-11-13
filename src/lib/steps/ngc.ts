import * as path from 'path';
import * as ng from '@angular/compiler-cli';
import * as ts from 'typescript';
import { NgPackageData } from '../model/ng-package-data';
import * as log from '../util/log';
import { componentTransformer } from './ts-transformers';

/** TypeScript configuration used internally (marker typer). */
type TsConfig = ng.ParsedConfiguration;

/** Prepares TypeScript Compiler and Angular Compiler option. */
const prepareTsConfig =
  (ngPkg: NgPackageData, basePath: string): TsConfig => {

    // Read the default configuration and overwrite package-specific options
    const tsConfig = ng.readConfiguration(path.resolve(__dirname, '..', 'conf', 'tsconfig.ngc.json'));
    tsConfig.rootNames = [ path.resolve(basePath, ngPkg.entryFile) ];
    tsConfig.options.flatModuleId = ngPkg.fullPackageName
    tsConfig.options.flatModuleOutFile = `${ngPkg.flatModuleFileName}.js`;
    tsConfig.options.basePath = basePath;
    tsConfig.options.baseUrl = basePath;
    tsConfig.options.outDir = path.resolve(basePath, '.ng_pkg_build');
    tsConfig.options.genDir = path.resolve(basePath, '.ng_pkg_build');

    return tsConfig;
  }

/** Inlines templateUrl and styleUrls from `@Component({..})` decorators. */
const transformTemplatesAndStyles =
  (tsConfig: TsConfig): ts.TransformationResult<ts.SourceFile> => {
    const compilerHost: ng.CompilerHost = ng.createCompilerHost({
      options: tsConfig.options
    });
    const program: ng.Program = ng.createProgram({
      rootNames: [ ...tsConfig.rootNames ],
      options: tsConfig.options,
      host: compilerHost
    });

    // transform typescript AST prior to compilation
    const transformationResult: ts.TransformationResult<ts.SourceFile> = ts.transform(
      program.getTsProgram().getSourceFiles(),
      [ componentTransformer ],
      tsConfig.options
    );

    return transformationResult;
  }

const compilerHostFromTransformation =
  ({transformation, options}: {transformation: ts.TransformationResult<ts.SourceFile>, options: ts.CompilerOptions}): ts.CompilerHost => {
    const wrapped = ts.createCompilerHost(options);

    return {
      ...wrapped,
      getSourceFile: (fileName, version) => {
        const inTransformation = transformation.transformed.find((file) => file.fileName === fileName);

        if (inTransformation) {
          // FIX see https://github.com/Microsoft/TypeScript/issues/19950
          if (!inTransformation['ambientModuleNames']) {
            inTransformation['ambientModuleNames'] = inTransformation['original']['ambientModuleNames'];
          }

          return inTransformation;
        } else {
          return wrapped.getSourceFile(fileName, version);
        }
      },
      getSourceFileByPath: (fileName, path, languageVersion) => {
        console.warn("getSourceFileByPath");

        return wrapped.getSourceFileByPath(fileName, path, languageVersion);
      }
    };
  }

/**
 * Compiles typescript sources with 'ngc'.
 *
 * @param ngPkg Angular package data
 * @param basePath
 * @returns Promise<string> Path of the flatModuleOutFile
 */
export async function ngc(ngPkg: NgPackageData, basePath: string): Promise<string> {
  log.debug(`ngc (v${ng.VERSION.full}): ${ngPkg.entryFile}`);

  const tsConfig = prepareTsConfig(ngPkg, basePath);
  const transformedSources = transformTemplatesAndStyles(tsConfig);

  // ng.CompilerHost
  const ngCompilerHost = ng.createCompilerHost({
    options: tsConfig.options,
    tsHost: compilerHostFromTransformation({
      options: tsConfig.options,
      transformation: transformedSources
    })
  });

  // ng.Program
  const ngProgram = ng.createProgram({
    rootNames: [ ...tsConfig.rootNames ],
    options: tsConfig.options,
    host: ngCompilerHost
  });

  // ngc
  const result = ng.performCompilation({
    rootNames: [ ...tsConfig.rootNames ],
    options: tsConfig.options,
    emitFlags: tsConfig.emitFlags,
    host: ngCompilerHost,
    oldProgram: ngProgram
  });
  console.log(result);


  /*
  // --> XX: start custom transformer
  // Hook into TypeScript transformation API
  const customTransformers: ng.CustomTransformers = {
    beforeTs: [ componentTransformer ]
  };

  // Invoke ngc programmatic API
  const result = ng.performCompilation({
    options: tsConfig.options,
    rootNames: tsConfig.rootNames,
    emitFlags: tsConfig.emitFlags,
    customTransformers
  });
  console.log(result);
  // <-- XX end custom transformers
  */

  return Promise.resolve(
    path.resolve(basePath, tsConfig.options.outDir, tsConfig.options.flatModuleOutFile)
  );
}
