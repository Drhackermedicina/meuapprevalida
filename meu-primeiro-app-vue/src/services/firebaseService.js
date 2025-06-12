import { db } from '@/firebaseConfig'; // Ajuste o caminho para o seu firebaseConfig.js
import { doc, setDoc } from "firebase/firestore";

export async function salvarEstacaoNoFirestore(estacaoData) {
  if (!estacaoData || !estacaoData.idEstacao) {
    throw new Error("Dados da estação ou idEstacao inválidos.");
  }
  const estacaoDocRef = doc(db, "estacoes_clinicas", estacaoData.idEstacao);
  try {
    await setDoc(estacaoDocRef, estacaoData);
    console.log("Estação salva com ID: ", estacaoData.idEstacao);
    return estacaoData.idEstacao;
  } catch (error) {
    console.error("Erro ao salvar estação no Firestore: ", error);
    throw new Error(`Falha ao salvar a estação: ${error.message}`);
  }
}