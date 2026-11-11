import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Amplia o acervo de vocabulário de campo com termos usados no dia a dia.
// Idempotente: não duplica termo já existente do mesmo eixo (comparação sem acento).
// Todos entram como origem "manual" e ficam disponíveis para AR, APR, PT e PTE.

const path = join(process.cwd(), "data", "field-vocabulary.json");
const backup = join(process.cwd(), "data", `field-vocabulary.before-expand-${new Date().toISOString().slice(0, 10)}.json`);

function normalize(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const ENTRIES = {
  activity: [
    ["Atividade atípica fora da rotina", "Serviço fora da rotina", "Geral"],
    ["Atendimento de emergência", "Emergência / parada", "Geral"],
    ["Solda de estrutura metálica", "Solda de estrutura", "Caldeiraria"],
    ["Corte com plasma", "Corte com plasma", "Caldeiraria"],
    ["Lixamento de peças", "Lixar peça", "Caldeiraria"],
    ["Retoque de pintura", "Retocar pintura", "Pintura"],
    ["Preparação de superfície para pintura", "Preparar para pintar", "Pintura"],
    ["Inspeção de solda", "Inspeção de solda", "Inspeção"],
    ["Inspeção de equipamento", "Inspeção de equipamento", "Inspeção"],
    ["Manutenção elétrica", "Manutenção elétrica", "Manutenção"],
    ["Troca de rolamento", "Trocar rolamento", "Manutenção"],
    ["Limpeza de trocador de calor", "Limpar trocador", "Manutenção"],
    ["Montagem de andaime", "Montar andaime", "Montagem"],
    ["Montagem de tubulação", "Montar tubulação", "Montagem"],
    ["Ajuste e alinhamento de peças", "Ajustar peça", "Montagem"],
    ["Movimentação com empilhadeira", "Empilhadeira", "Logística"],
    ["Recebimento e conferência de material", "Receber material", "Logística"],
    ["Organização de almoxarifado", "Organizar almoxarifado", "Housekeeping"],
    ["Trabalho em computador", "Trabalho no computador", "Administrativo"],
    ["Manutenção em quadro elétrico", "Mexer no quadro elétrico", "Elétrica"],
    ["Lançamento de cabos", "Passar cabo", "Elétrica"],
    ["Instalação de luminárias", "Instalar luminária", "Elétrica"],
    ["Escavação manual", "Cavar vala", "Civil"],
    ["Concretagem", "Concretar", "Civil"],
    ["Alvenaria e reboco", "Alvenaria", "Civil"],
    ["Trabalho em telhado", "Trabalho no telhado", "Altura"],
    ["Trabalho em plataforma elevatória", "Plataforma elevatória", "Altura"],
    ["Pintura em altura", "Pintar em altura", "Altura"],
    ["Entrada em silo ou moega", "Entrar no silo", "Espaço confinado"],
    ["Limpeza interna de tanque", "Limpar tanque por dentro", "Espaço confinado"],
    ["Inspeção interna de vaso", "Inspecionar vaso por dentro", "Espaço confinado"],
    ["Içamento com ponte rolante", "Içar com ponte rolante", "Movimentação"],
    ["Içamento com guincho", "Içar com guincho", "Movimentação"],
  ],
  stage: [
    ["Reunião de abertura e conversa de segurança", "DDS antes de começar", "1. Preparação"],
    ["Desenergização e bloqueio", "Desligar e bloquear", "1. Preparação"],
    ["Teste dos equipamentos de medição", "Testar medidor", "1. Preparação"],
    ["Verificação de EPI da equipe", "Conferir EPI", "1. Preparação"],
    ["Checagem de ferramentas e acessórios", "Conferir ferramenta", "1. Preparação"],
    ["Remoção de peças e componentes", "Remover peça", "2. Execução"],
    ["Corte e ajuste de material", "Cortar e ajustar", "2. Execução"],
    ["Soldagem e acabamento", "Soldar", "2. Execução"],
    ["Montagem final", "Montar", "2. Execução"],
    ["Movimentação de material", "Movimentar material", "2. Execução"],
    ["Aplicação de produto químico", "Aplicar produto", "2. Execução"],
    ["Trabalho em altura", "Subir e trabalhar", "2. Execução"],
    ["Entrada em espaço confinado", "Entrar no espaço", "2. Execução"],
    ["Içamento de carga", "Içar carga", "2. Execução"],
    ["Desmontagem de andaime", "Desmontar andaime", "3. Encerramento"],
    ["Limpeza final da área", "Limpar a área", "3. Encerramento"],
    ["Descarte de resíduos", "Descartar resíduo", "3. Encerramento"],
    ["Inspeção final do serviço", "Inspeção final", "3. Encerramento"],
    ["Liberação da área", "Liberar a área", "3. Encerramento"],
    ["Registro de encerramento", "Fechar o registro", "3. Encerramento"],
  ],
  location: [
    ["Área de produção", "Produção", "Interno"],
    ["Área de solda", "Solda", "Interno"],
    ["Oficina mecânica", "Oficina", "Interno"],
    ["Depósito de inflamáveis", "Depósito de inflamáveis", "Interno"],
    ["Sala de painéis elétricos", "Sala de painéis", "Interno"],
    ["Subestação", "Subestação", "Interno"],
    ["Casa de bombas", "Casa de bombas", "Interno"],
    ["Silo e moega", "Silo e moega", "Interno"],
    ["Elevador de canecas", "Elevador de canecas", "Interno"],
    ["Galeria de tubulação", "Galeria de tubos", "Interno"],
    ["Telhado", "Telhado", "Externo"],
    ["Pátio de cargas", "Pátio de cargas", "Externo"],
    ["Estacionamento", "Estacionamento", "Externo"],
    ["Área de resíduos", "Área de resíduos", "Externo"],
    ["Escavação no pátio", "Vala no pátio", "Externo"],
    ["Área de tancagem", "Tancagem", "Externo"],
    ["Sala de reuniões", "Sala de reunião", "Administrativo"],
  ],
  condition: [
    ["Área bloqueada e sinalizada", "Bloqueada e sinalizada", "Conforme"],
    ["Equipamento bloqueado e etiquetado", "Bloqueado e etiquetado", "Conforme"],
    ["Sinalização visível", "Sinalização ok", "Conforme"],
    ["EPI completo para a tarefa", "EPI ok", "Conforme"],
    ["Permissão de trabalho emitida", "Permissão emitida", "Conforme"],
    ["Área sem isolamento", "Sem isolamento", "Atenção"],
    ["Equipamento energizado durante a atividade", "Equipamento ligado", "Atenção"],
    ["Iluminação deficiente", "Local escuro", "Atenção"],
    ["Ventilação insuficiente", "Sem ventilação", "Atenção"],
    ["Piso molhado ou escorregadio", "Piso molhado", "Atenção"],
    ["Sinalização apagada ou ausente", "Sem sinalização", "Atenção"],
    ["EPI incompleto ou danificado", "EPI ruim", "Atenção"],
    ["Circulação de terceiros na área", "Terceiros circulando", "Atenção"],
    ["Ruído alto no entorno", "Barulho por perto", "Atenção"],
    ["Espaço reduzido para a tarefa", "Local apertado", "Atenção"],
  ],
  hazard: [
    ["RUÍDO CONTÍNUO", "Barulho constante no ambiente", "Físico"],
    ["CALOR EXCESSIVO", "Muito calor no local", "Físico"],
    ["FRIO EXCESSIVO", "Muito frio no local", "Físico"],
    ["VIBRAÇÃO DE MÁQUINAS", "Vibração de máquina", "Físico"],
    ["ILUMINAÇÃO INSUFICIENTE", "Local escuro", "Físico"],
    ["PRESSÃO EM SISTEMA", "Ar comprimido ou pressão", "Físico"],
    ["RADIAÇÃO NÃO IONIZANTE", "Luz de solda", "Físico"],
    ["POEIRA NO AR", "Poeira suspensa", "Químico"],
    ["NÉVOA DE TINTA", "Névoa de tinta", "Químico"],
    ["VAPORES ORGÂNICOS", "Cheiro forte de solvente", "Químico"],
    ["GÁS COMPRIMIDO", "Cilindro de gás", "Químico"],
    ["PRODUTO DE LIMPEZA", "Produto de limpeza", "Químico"],
    ["FUMAÇA DE SOLDA", "Fumaça de solda", "Químico"],
    ["MICRORGANISMOS EM ÁGUA PARADA", "Água parada e sujeira", "Biológico"],
    ["CONTATO COM RESÍDUOS", "Contato com lixo ou resíduo", "Biológico"],
    ["ANIMAIS E INSETOS", "Insetos, ratos ou animais", "Biológico"],
    ["LEVANTAMENTO MANUAL DE CARGA", "Pegar peso na mão", "Ergonômico"],
    ["MOVIMENTO REPETITIVO", "Movimento repetido", "Ergonômico"],
    ["POSTURA AGACHADA", "Ficar agachado", "Ergonômico"],
    ["TRABALHO ACIMA DA CABEÇA", "Braços para cima", "Ergonômico"],
    ["ESFORÇO DE EMPURRAR OU PUXAR", "Empurrar ou puxar peso", "Ergonômico"],
    ["QUEDA DE PESSOA EM MESMO NÍVEL", "Escorregar ou tropeçar", "Acidente / mecânico"],
    ["QUEDA DE PESSOA COM DIFERENÇA DE NÍVEL", "Cair de altura", "Acidente / mecânico"],
    ["PRENSAMENTO DE MEMBROS", "Prender a mão ou o dedo", "Acidente / mecânico"],
    ["CORTE POR FERRAMENTA OU CHAPA", "Corte de ferramenta", "Acidente / mecânico"],
    ["CONTATO COM PARTE MÓVEL", "Encostar em correia ou eixo", "Acidente / mecânico"],
    ["PROJEÇÃO DE PARTÍCULAS", "Lasca ou cavaco no olho", "Acidente / mecânico"],
    ["COLISÃO COM VEÍCULO OU EMPILHADEIRA", "Ser atingido por veículo", "Acidente / mecânico"],
    ["ESMAGAMENTO POR CARGA", "Carga caindo sobre a pessoa", "Acidente / mecânico"],
    ["QUEIMADURA TÉRMICA", "Queimadura por superfície quente", "Acidente / mecânico"],
    ["QUEIMADURA QUÍMICA", "Queimadura por produto químico", "Acidente / mecânico"],
    ["CHOQUE ELÉTRICO", "Levar choque", "Acidente / mecânico"],
    ["INCÊNDIO E EXPLOSÃO", "Risco de incêndio", "Acidente / mecânico"],
    ["ATMOSFERA ALTERADA EM ESPAÇO CONFINADO", "Ar ruim no espaço confinado", "Acidente / mecânico"],
    ["SOTERRAMENTO", "Ser soterrado em vala", "Acidente / mecânico"],
    ["AFOGAMENTO", "Risco de afogamento", "Acidente / mecânico"],
    ["TRABALHO SOBRE GRÃOS", "Andar sobre grãos", "Acidente / mecânico"],
    ["TRABALHO ISOLADO", "Trabalhar sozinho", "Outros perigos"],
    ["COMUNICAÇÃO DEFICIENTE", "Rádio ou aviso que falha", "Outros perigos"],
    ["INTERFERÊNCIA COM TERCEIROS", "Outra equipe no mesmo local", "Outros perigos"],
  ],
  harm: [
    ["Perda auditiva parcial ou total.", "Perda de audição", "Consequências"],
    ["Queimadura de pele.", "Queimadura na pele", "Consequências"],
    ["Corte e laceração.", "Corte", "Consequências"],
    ["Fratura e luxação.", "Osso quebrado", "Consequências"],
    ["Amputação traumática.", "Perda de dedo ou membro", "Consequências"],
    ["Contusão e hematoma.", "Batida e roxo", "Consequências"],
    ["Lesão por esforço repetitivo (LER/DORT).", "Dor por esforço repetido", "Consequências"],
    ["Lombalgia e dor nas costas.", "Dor nas costas", "Consequências"],
    ["Intoxicação aguda.", "Intoxicação", "Consequências"],
    ["Irritação de pele e dermatose.", "Irritação na pele", "Consequências"],
    ["Irritação ocular e conjuntivite.", "Olho irritado", "Consequências"],
    ["Problema respiratório e asma ocupacional.", "Falta de ar", "Consequências"],
    ["Infecção e doença infectocontagiosa.", "Infecção", "Consequências"],
    ["Desidratação e estresse térmico.", "Mal-estar por calor", "Consequências"],
    ["Hipotermia.", "Mal-estar por frio", "Consequências"],
    ["Choque elétrico e queimadura elétrica.", "Choque elétrico", "Consequências"],
    ["Asfixia e desmaio.", "Falta de ar e desmaio", "Consequências"],
    ["Afogamento.", "Afogamento", "Consequências"],
    ["Óbito em caso extremo.", "Morte", "Consequências"],
    ["Ansiedade e estresse ocupacional.", "Estresse", "Consequências"],
    ["Tontura e náusea.", "Tontura", "Consequências"],
    ["Dano material e parada de produção.", "Quebra de equipamento", "Consequências"],
  ],
  control: [
    ["Med.Adm.: PROCEDIMENTO DE TRABALHO REVISADO", "Procedimento revisado", "Medida administrativa"],
    ["Med.Adm.: PERMISSÃO DE TRABALHO", "Permissão de trabalho", "Medida administrativa"],
    ["Med.Adm.: BLOQUEIO E ETIQUETAGEM (LOTO)", "Bloquear e etiquetar", "Medida administrativa"],
    ["Med.Adm.: ISOLAMENTO E SINALIZAÇÃO DA ÁREA", "Isolar e sinalizar", "Medida administrativa"],
    ["Med.Adm.: INSPEÇÃO ANTES DE INICIAR", "Inspeção antes de começar", "Medida administrativa"],
    ["Med.Adm.: ORDEM DE SERVIÇO", "Ordem de serviço", "Medida administrativa"],
    ["Med.Adm.: DDS ESPECÍFICO DA TAREFA", "Conversa de segurança", "Medida administrativa"],
    ["Med.Adm.: SUPERVISÃO PRESENTE NA ATIVIDADE", "Supervisor acompanhando", "Medida administrativa"],
    ["Med.Adm.: RODÍZIO DE ATIVIDADES", "Trocar de atividade", "Medida administrativa"],
    ["Med.Adm.: PAUSA E ALONGAMENTO", "Pausa para alongar", "Medida administrativa"],
    ["EPI: LUVA DE PROTEÇÃO MECÂNICA", "Luva", "EPI"],
    ["EPI: LUVA ISOLANTE PARA ELÉTRICA", "Luva de eletricista", "EPI"],
    ["EPI: LUVA NITRÍLICA", "Luva de borracha", "EPI"],
    ["EPI: ÓCULOS AMPLA VISÃO", "Óculos de proteção", "EPI"],
    ["EPI: PROTETOR FACIAL", "Protetor de face", "EPI"],
    ["EPI: BOTINA DE SEGURANÇA", "Botina", "EPI"],
    ["EPI: CAPACETE COM JUGULAR", "Capacete", "EPI"],
    ["EPI: PROTETOR AURICULAR", "Protetor de ouvido", "EPI"],
    ["EPI: RESPIRADOR SEMIFACIAL", "Máscara respiratória", "EPI"],
    ["EPI: AVENTAL DE RASPA", "Avental de raspa", "EPI"],
    ["EPI: PERNEIRA", "Perneira", "EPI"],
    ["EPI: CINTO PARAQUEDISTA COM TALABARTE", "Cinto com talabarte", "EPI"],
    ["EPI: MÁSCARA DE SOLDA", "Máscara de solda", "EPI"],
    ["Outros: CAPTAÇÃO E EXAUSTÃO LOCAL", "Exaustão no local", "Outros controles"],
    ["Outros: VENTILAÇÃO FORÇADA", "Ventilador no local", "Outros controles"],
    ["Outros: BARRAMENTO FÍSICO", "Barreira física", "Outros controles"],
    ["Outros: COLETOR DE POEIRA", "Coletor de poeira", "Outros controles"],
  ],
};

const library = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(library.entries)) throw new Error("Arquivo de vocabulário sem lista de termos.");
if (!existsSync(backup)) copyFileSync(path, backup);

let added = 0;
let skipped = 0;
for (const [kind, entries] of Object.entries(ENTRIES)) {
  for (const [label, simpleLabel, group] of entries) {
    if (library.entries.some((entry) => entry.kind === kind && normalize(entry.label) === normalize(label))) {
      skipped += 1;
      continue;
    }
    library.entries.push({
      id: `vocab-${kind}-field-${library.entries.length + 1}`,
      kind,
      label,
      simpleLabel,
      group,
      source: "manual",
      uses: 0,
    });
    added += 1;
  }
}

writeFileSync(path, `${JSON.stringify(library, null, 2)}\n`);
const totals = {};
for (const entry of library.entries) totals[entry.kind] = (totals[entry.kind] ?? 0) + 1;
console.log(JSON.stringify({ added, skipped, total: library.entries.length, totals }, null, 2));
