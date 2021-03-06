const types = require('ast-types');
const codeshift = require('jscodeshift');
const { getExpressionType } = require('../helpers/selectionHelpers');
const parseTree = require('../helpers/parseTree.js');

module.exports = {
  // any functions containing 'await' expressions need to be async:
  asyncify: (ast) => {

  },
  // any redefined consts may need to be lets:
  constToLet: (ast) => {
    const allNames = {};
    ast.find(codeshift.VariableDeclaration)
    .filter(p => p.value.kind === 'const')
    .forEach(p => {
      if (allNames[p.value.declarations[0].id.name]) {
        allNames[p.value.declarations[0].id.name].push(p);
      } else {
        allNames[p.value.declarations[0].id.name] = [p];
      }
    });
    // also get assignment expressions referencing this variable:
    ast.find(codeshift.AssignmentExpression)
    .filter(p => p.value.left.type === 'Identifier')
    .forEach(p => {
      if (allNames[p.value.left.name]) {
        allNames[p.value.left.name].push(p);
      } else {
        allNames[p.value.left.name] = [p];
      }
    });
    Object.keys(allNames).forEach(varName => {
      const varDecls = allNames[varName];
      // ignore it if it was only declared one time:
      if (varDecls.length === 1) {
        return;
      }
      // turn the first one into a let:
      varDecls[0].value.kind = 'let';
      // turn all var decls into assignment expressions:
      for (let i = 1; i < varDecls.length; i++) {
        const varDecl = varDecls[i];
        if (varDecl.value.type === 'VariableDeclaration') {
          const newAssignment = codeshift.expressionStatement(
            codeshift.assignmentExpression('=',
              codeshift.identifier(varName),
              varDecl.value.declarations[0].init));
          varDecl.replace(newAssignment);
        }
      }
    });

    // also do the same for assignment expressions:
    ast.find(codeshift.AssignmentExpression)
    .filter(p => p.value.kind === 'const')
    .forEach(p => {
      if (allNames[p.value.declarations[0].id.name]) {
        allNames[p.value.declarations[0].id.name].push(p);
      } else {
        allNames[p.value.declarations[0].id.name] = [p];
      }
    });
  },
  // strip out anything that is 'await <literal>'
  stripUnusedAwaits: (ast) => {
    ast.find(codeshift.AwaitExpression)
    .forEach(p => {
      if (p.value.argument.type === 'Literal') {
        p.replace();
        return;
      }
      // if the member expression rightmost term is not a function don't 'await' it:
      if (p.value.argument.type === 'MemberExpression') {
        if (getExpressionType(p.value.argument) === 'Identifier') {
          p.replace(p.value.argument);
        }
      }
    });
  },
  // strip variable declarations that are not used:
  stripUnused: (ast) => {
    const varNames = {};
    // get all declarations:
    ast.find(codeshift.VariableDeclaration)
    .forEach(p => {
      varNames[p.value.declarations[0].id.name] = p;
    });
    // get all references to it:
    ast.find(codeshift.Identifier)
    .forEach(p => {
      const decl = varNames[p.value.name];
      if (decl) {
        if (decl.value.loc) {
          if (p.value.loc.start.line !== decl.value.loc.start.line) {
            delete varNames[p.value.name];
          }
        } else {
          delete varNames[p.value.name];
        }
      }
    });
    // now delete everything left over:
    Object.values(varNames).forEach(p => {
      p.replace();
    });
  },
  // remove duplicated variable declarations (under construction)
  // stripDuplicates: (ast) => {
    // loop over every variable declaration
  //   ast.find(codeshift.VariableDeclaration)
  //   .forEach(var1 => {
  //     ast.find(codeshift.VariableDeclaration)
  //     .forEach(var2 => {
  //       if (var1 !== var2) {
  //         const name1 = var1.value.declarations[0].id.name;
  //         const name2 = var2.value.declarations[0].id.name;
  //         if (name1 === name2) {
  //           // console.log(var1);
  //         }
  //       }
  //     });
  //   });
  // },
  // always return if last item in a block is a variable declaration or function call
  returnLastDeclaration: (ast) => {
    ast.find(codeshift.BlockStatement)
    .forEach(p => {
      // check if parent is func
      if (p.parentPath.value.type === 'ArrowFunctionExpression' || p.parentPath.value.type === 'FunctionExpression') {
        const lastStatement = p.value.body[p.value.body.length - 1];
        if (lastStatement.type === 'ExpressionStatement' && lastStatement.expression) {
          // if the last statement declares a variable, add a returrn under it:
          if (lastStatement.expression.type === 'VariableDeclaration') {
            const varName = lastStatement.expression.declarations[0].id.name;
            p.value.body.push(`return ${varName};`);
            return;
          }
          if (lastStatement.expression.type === 'CallExpression') {
            p.value.body[p.value.body.length - 1] = codeshift.returnStatement(lastStatement.expression);
          }
        }
      }
    });
    // ast.find(codeshift.FunctionExpression)
    // .forEach(f => {
    //   types.visit(f, {
    //     visitBlockStatement(p) {
    //       const lastStatement = p.value.body[p.value.body.length - 1];
    //       if (lastStatement.type === 'ExpressionStatement' && lastStatement.expression) {
    //         if (lastStatement.expression.type === 'VariableDeclaration') {
    //           const varName = lastStatement.expression.declarations[0].id.name;
    //           p.value.body.push(`return ${varName};`);
    //           return this.traverse(p);
    //         }
    //         if (lastStatement.expression.type === 'CallExpression') {
    //           p.value.body[p.value.body.length - 1] = codeshift.returnStatement(lastStatement.expression);
    //         }
    //       }
    //       return this.traverse(p);
    //     }
    //   });
    // });
    // ast.find(codeshift.ArrowFunctionExpression)
    // .forEach(p => {
    // });
  }
};
