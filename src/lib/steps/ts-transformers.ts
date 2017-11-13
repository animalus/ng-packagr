import * as ts from 'typescript';
import { isPropertyAssignment } from 'typescript';

export const isComponentDecorator =
  (node: ts.Node): node is ts.Decorator =>
    ts.isDecorator(node) && node
      .getChildren().find(ts.isCallExpression)
      .getChildren().find(ts.isIdentifier)
      .getText() === 'Component';
      /* TODO: text comparison can break when
       * `import { Component as foo } from '@angular/core'` or
       * `import * as ng from '@angular/core'`
       * @link https://github.com/angular/devkit/blob/master/packages/schematics/angular/utility/ast-utils.ts#L127-L128
       */

export const isPropertyAssignmentFor =
  (node: ts.Node, name: string): node is ts.PropertyAssignment =>
    ts.isPropertyAssignment(node) && node.name.getText() === name;

export const isTemplateUrl =
  (node: ts.Node): node is ts.PropertyAssignment => isPropertyAssignmentFor(node, 'templateUrl');

export const isStyleUrls =
  (node: ts.Node): node is ts.PropertyAssignment => isPropertyAssignmentFor(node, 'styleUrls');

export const componentTransformer: ts.TransformerFactory<ts.SourceFile> =
  (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => {

    const visitComponents = (node: ts.Decorator): ts.Node => {
      if (isTemplateUrl(node)) {
        return ts.updatePropertyAssignment(
          node,
          ts.createIdentifier('template'),
          ts.createLiteral('foobar')
        );
      } else if (isStyleUrls(node)) {
        // TODO ...
      }

      return ts.visitEachChild(node, visitComponents, context);
    };

    const visitDecorators = (node: ts.Node): ts.Node =>
      isComponentDecorator(node)
        ? ts.visitEachChild(node, visitComponents, context)
        : ts.visitEachChild(node, visitDecorators, context);

    return ts.visitNode(sourceFile, visitDecorators);
  }
