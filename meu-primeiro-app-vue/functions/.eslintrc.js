module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}], // Mantém aspas duplas, mas agora você sabe qual regra é.
    // --- ADIÇÕES E ALTERAÇÕES PARA RELAXAR AS REGRAS DO LINTING ---
    "indent": ["error", 2, { "SwitchCase": 1 }], // Altera a indentação para 2 espaços, que é comum. O padrão do Google pode ser 2 ou 4, mas 8 é menos comum. Verifique a sua indentação atual.
    "max-len": ["warn", { "code": 120, "ignoreUrls": true, "ignoreStrings": true, "ignoreTemplateLiterals": true }], // Muda para "warn" (aviso) e aumenta o limite para 120 caracteres.
    "object-curly-spacing": ["error", "always"], // Garante um espaço dentro das chaves de objeto.
    "comma-dangle": ["error", "always-multiline"], // Exige vírgulas à direita em linhas múltiplas.
    "eol-last": ["error", "always"], // Garante que o arquivo termine com uma nova linha.
    // Adicione esta regra se você estiver usando aspas simples em algum lugar e quiser ignorar o erro:
    // "quotes": "off", // Desativa completamente a regra de aspas se você não quiser corrigir manualmente
    // "indent": "off", // Desativa completamente a regra de indentação
    // "max-len": "off", // Desativa completamente a regra de comprimento da linha
    // "object-curly-spacing": "off", // Desativa o espaçamento de objeto
    // "comma-dangle": "off", // Desativa vírgulas pendentes
    // "eol-last": "off", // Desativa nova linha no final do arquivo
    // 'linebreak-style': ['error', 'unix'], // Força estilo de linha Unix (LF)
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
