<template>
  <div class="container-teste-estacao">
    <h1>Teste de Carregamento de Estação JSON</h1>
    <p>Selecione o arquivo <code>estacao_teste.json</code> que você salvou para ver os dados carregados.</p>

    <div class="upload-section">
      <label for="file-upload" class="custom-file-upload">
        Escolher Arquivo JSON
      </label>
      <input id="file-upload" type="file" @change="carregarArquivoEstacao" accept=".json" />
      <span v-if="nomeArquivoSelecionado" class="nome-arquivo">{{ nomeArquivoSelecionado }}</span>
    </div>

    <div v-if="mensagem" :class="['mensagem-feedback', tipoMensagem]">
      {{ mensagem }}
    </div>

    <div v-if="estacaoCarregada" class="estacao-detalhes">
      <h2>Estação Carregada: {{ estacaoCarregada.tituloEstacao }}</h2>
      <p><strong>Especialidade:</strong> {{ estacaoCarregada.especialidade }}</p>
      <p><strong>ID:</strong> {{ estacaoCarregada.idEstacao }}</p>
      
      <h3>Preview da Descrição do Caso:</h3>
      <p>{{ estacaoCarregada.instrucoesParticipante && estacaoCarregada.instrucoesParticipante.descricaoCasoCompleta }}</p>

      <h3>Preview das Tarefas Principais:</h3>
      <ul v-if="estacaoCarregada.instrucoesParticipante && estacaoCarregada.instrucoesParticipante.tarefasPrincipais">
        <li v-for="(tarefa, index) in estacaoCarregada.instrucoesParticipante.tarefasPrincipais" :key="`tarefa-${index}`">
          {{ tarefa }}
        </li>
      </ul>

      <h3>Console Log:</h3>
      <p>Abra o console do seu navegador (F12 ou Inspecionar > Console) para ver o objeto completo da estação que foi carregado e "parseado".</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CarregarEstacaoTeste', // Dê um nome ao seu componente
  data() {
    return {
      estacaoCarregada: null,
      mensagem: '',
      tipoMensagem: 'info', // 'info', 'sucesso', 'erro'
      nomeArquivoSelecionado: ''
    };
  },
  methods: {
    carregarArquivoEstacao(event) {
      const arquivo = event.target.files[0];
      this.mensagem = ''; // Limpa mensagem anterior
      this.nomeArquivoSelecionado = '';
      this.estacaoCarregada = null; // Limpa estação anterior

      if (!arquivo) {
        this.mensagem = "Nenhum arquivo selecionado.";
        this.tipoMensagem = 'erro';
        return;
      }

      this.nomeArquivoSelecionado = arquivo.name;

      if (arquivo.type !== "application/json") {
        this.mensagem = `O arquivo "${arquivo.name}" não é do tipo JSON. Por favor, selecione um arquivo .json`;
        this.tipoMensagem = 'erro';
        return;
      }

      const leitor = new FileReader();

      leitor.onload = (e) => {
        try {
          const dadosJson = JSON.parse(e.target.result);
          
          // Validação muito básica para ver se é um objeto e tem um título (você adicionará validações mais robustas depois)
          if (typeof dadosJson === 'object' && dadosJson !== null && dadosJson.tituloEstacao) {
            this.estacaoCarregada = dadosJson;
            this.mensagem = `Estação "${this.estacaoCarregada.tituloEstacao}" carregada com sucesso do arquivo "${arquivo.name}"!`;
            this.tipoMensagem = 'sucesso';
            console.log("Objeto da Estação Carregada:", this.estacaoCarregada); // Para depuração
          } else {
            this.mensagem = `O arquivo "${arquivo.name}" não parece ser um JSON de estação válido (faltam campos esperados como tituloEstacao).`;
            this.tipoMensagem = 'erro';
            this.estacaoCarregada = null;
          }
        } catch (error) {
          this.mensagem = `Erro ao processar o arquivo JSON "${arquivo.name}". Verifique se o formato está correto. Detalhes: ${error.message}`;
          this.tipoMensagem = 'erro';
          console.error("Erro no JSON:", error);
          this.estacaoCarregada = null;
        }
      };

      leitor.onerror = () => {
        this.mensagem = `Erro ao tentar ler o arquivo "${arquivo.name}".`;
        this.tipoMensagem = 'erro';
        this.estacaoCarregada = null;
      };

      leitor.readAsText(arquivo);
    }
  }
};
</script>

<style scoped>
.container-teste-estacao {
  font-family: sans-serif;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  max-width: 800px;
  margin: 20px auto;
  background-color: #f9f9f9;
}

.upload-section {
  margin-bottom: 20px;
  padding: 15px;
  border: 2px dashed #007bff;
  border-radius: 5px;
  background-color: #fff;
  text-align: center;
}

.custom-file-upload {
  border: 1px solid #007bff;
  display: inline-block;
  padding: 8px 15px;
  cursor: pointer;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  font-weight: bold;
}

.custom-file-upload:hover {
  background-color: #0056b3;
}

/* Esconde o input de arquivo padrão, pois estamos usando um label estilizado */
input[type="file"] {
  display: none;
}

.nome-arquivo {
  display: block;
  margin-top: 10px;
  font-style: italic;
  color: #555;
}

.mensagem-feedback {
  margin-top: 15px;
  padding: 10px;
  border-radius: 4px;
  font-weight: bold;
}

.mensagem-feedback.info {
  background-color: #eef2fa;
  color: #305291;
  border: 1px solid #b8c7e0;
}

.mensagem-feedback.sucesso {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.mensagem-feedback.erro {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.estacao-detalhes {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #e0e0e0;
  background-color: #fff;
  border-radius: 5px;
}

.estacao-detalhes h2, .estacao-detalhes h3 {
  color: #333;
}

.estacao-detalhes ul {
  list-style-type: disc;
  margin-left: 20px;
}
</style>