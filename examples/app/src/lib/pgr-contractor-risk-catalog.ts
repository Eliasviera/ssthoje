export type ContractorRiskItem = {
  id: string;
  keywords: string[];
  activityGroup: string;
  hazard: string;
  possibleDamage: string;
  interference: string;
  control: string;
  ppe: string;
};

export const CONTRACTOR_RISK_CATALOG: ContractorRiskItem[] = [
  {
    id: "alv-poeira-cimento",
    keywords: ["pedreiro", "alvenaria", "cimento", "argamassa", "reboco", "massa", "ajuste", "reparo"],
    activityGroup: "Alvenaria, argamassa e cimento",
    hazard: "Poeira de cimento e argamassa",
    possibleDamage: "Irritação das vias respiratórias, olhos e pele",
    interference: "Geração de poeira em área próxima à operação da contratante",
    control: "Umidificar levemente o material, evitar varrição a seco, conter a dispersão e manter ventilação adequada",
    ppe: "Óculos de segurança, luvas de proteção, calçado de segurança e máscara PFF2 quando houver geração significativa de poeira"
  },
  {
    id: "alv-transporte-manual",
    keywords: ["pedreiro", "alvenaria", "cimento", "argamassa", "bloco", "tijolo", "reparo", "ajuste"],
    activityGroup: "Alvenaria, argamassa e cimento",
    hazard: "Levantamento e transporte manual de cargas",
    possibleDamage: "Lesões musculoesqueléticas (coluna, ombros e membros superiores)",
    interference: "Tráfego de pessoas e equipamentos nas rotas internas da contratante",
    control: "Dividir as cargas, adotar postura correta, utilizar carrinho/betoneira sempre que possível e respeitar as rotas internas",
    ppe: "Calçado de segurança com sola antiderrapante, luvas de proteção"
  },
  {
    id: "alv-ferramentas-manuais",
    keywords: ["ferramenta", "ferramentas manuais", "colher", "desempenadeira", "talhadeira", "marreta", "cinzel", "pedreiro"],
    activityGroup: "Ferramentas manuais",
    hazard: "Uso de ferramentas manuais (colher, desempenadeira, talhadeira, marreta, cinzel)",
    possibleDamage: "Cortes, perfurações, esmagamentos e contusões",
    interference: "Trabalho em área compartilhada com outras atividades",
    control: "Verificar estado das ferramentas, utilizar corretamente, manter em local adequado, não deixar soltas e organizar o local",
    ppe: "Luvas de proteção, calçado de segurança, óculos de segurança"
  },
  {
    id: "alv-ferramentas-eletricas",
    keywords: ["ferramenta elétrica", "furadeira", "serra", "esmerilhadeira", "lixadeira", "disco", "elétrica"],
    activityGroup: "Ferramentas elétricas",
    hazard: "Uso de ferramentas elétricas portáteis",
    possibleDamage: "Choque elétrico, cortes, projeção de partículas, queimaduras e lesões",
    interference: "Instalações elétricas, áreas operacionais e circulação da contratante",
    control: "Verificar cabo/plugues, usar em boas condições, proteger tomadas/acessos, manter área seca, usar guarda-protetor e seguir orientações da contratante",
    ppe: "Óculos de segurança, luvas adequadas ao trabalho, calçado de segurança, protetor auricular quando houver ruído"
  },
  {
    id: "alv-rompedor",
    keywords: ["rompedor", "martelete", "demolição", "rompimento", "piso", "concreto"],
    activityGroup: "Rompedores e demolição pontual",
    hazard: "Rompimento de concreto/piso com rompedor/martelete",
    possibleDamage: "Vibrações, projeção de fragmentos, ruído excessivo, quedas ao mesmo nível, contato com cabos/tubulações ocultos",
    interference: "Operação da contratante, tráfego, áreas produtivas, possibilidade de interferência com redes",
    control: "Solicitar liberação/identificação de redes com responsável da contratante, delimitar e sinalizar área, umidificar para conter poeira, manter distanciamento de terceiros",
    ppe: "Óculos de segurança, protetor auricular, luvas de proteção, calçado de segurança com sola antiderrapante, máscara PFF2, vestimenta adequada"
  },
  {
    id: "alv-betoneira",
    keywords: ["betoneira", "mistura", "argamassa", "concreto", "traço"],
    activityGroup: "Betoneiras e mistura de argamassa",
    hazard: "Operação de betoneira e manuseio de materiais",
    possibleDamage: "Esmagamento, cortes, quedas, poeira, contato com partes móveis",
    interference: "Circulação, acesso de materiais, espaço compartilhado com a contratante",
    control: "Posicionar em local estável e plano, manter afastado de passagens, não colocar mãos em partes móveis, abastecer com cuidado, desligar para manutenção/limpeza",
    ppe: "Calçado de segurança, luvas de proteção, óculos de segurança, roupa adequada"
  },
  {
    id: "alv-escada",
    keywords: ["escada", "escadas", "escada simples", "acesso"],
    activityGroup: "Escadas portáteis",
    hazard: "Utilização de escadas portáteis",
    possibleDamage: "Quedas de altura, escorregamento, tombamento da escada",
    interference: "Circulação nas áreas da contratante e trabalhos em locais compartilhados",
    control: "Utilizar escada adequada ao serviço, apoiar em base firme e nivelada, manter 3 pontos de apoio quando possível, não subir com ferramentas nas mãos, proibir escada apoiada em tubulações frágeis ou portas",
    ppe: "Calçado de segurança com sola antiderrapante"
  },
  {
    id: "alv-andaime",
    keywords: ["andaime", "andaimes", "montagem", "desmontagem", "plataforma"],
    activityGroup: "Andaimes",
    hazard: "Montagem, uso ou desmontagem de andaimes",
    possibleDamage: "Quedas de altura, queda de materiais, tombamento, esmagamento",
    interference: "Áreas de circulação, operação da contratante e passagem de terceiros",
    control: "Somente pessoas habilitadas/orientadas para montagem quando aplicável, andaime em base estável e nivelada, pisos completos, guarda-corpo/rodapé quando exigível, acesso seguro, não sobrecarregar, retirar materiais ao final da jornada",
    ppe: "Calçado de segurança com sola antiderrapante, cinto de segurança tipo paraquedista com talabarte quando houver risco de queda de altura conforme avaliação/orientação, luvas, capacete com jugular quando exigido pela contratante"
  },
  {
    id: "alv-queda-mesmo-nivel",
    keywords: ["pedreiro", "alvenaria", "obra", "reparo", "ajuste"],
    activityGroup: "Alvenaria, argamassa e cimento",
    hazard: "Piso irregular, molhado ou com entulho/argamassa",
    possibleDamage: "Quedas ao mesmo nível, torções e escoriações",
    interference: "Obstrução de passagens, corredores e saídas de emergência",
    control: "Manter local limpo e organizado, retirar entulho, secar pontos molhados, isolar/sinalizar a área e não obstruir rotas de circulação e saídas de emergência",
    ppe: "Calçado de segurança com sola antiderrapante"
  },
  {
    id: "alv-projecao",
    keywords: ["pedreiro", "alvenaria", "reboco", "argamassa", "rompedor"],
    activityGroup: "Alvenaria, argamassa e cimento",
    hazard: "Projeção de fragmentos, partículas e respingos de argamassa/concreto",
    possibleDamage: "Lesões oculares e faciais",
    interference: "Presença de terceiros nas proximidades da área de serviço",
    control: "Delimitar a área de trabalho, sinalizar, orientar terceiros a manter distância, adotar cuidado na execução",
    ppe: "Óculos de segurança"
  },
  {
    id: "alv-interferencia-producao",
    keywords: ["pedreiro", "alvenaria", "reparo", "ajuste", "manutenção"],
    activityGroup: "Interferência com operação da contratante",
    hazard: "Interferência com a produção/movimentação da contratante",
    possibleDamage: "Acidente por interação com veículos, empilhadeiras ou operações em andamento",
    interference: "Circulação interna, acesso a áreas produtivas, pontos de carga/descarga, saídas de emergência",
    control: "Solicitar autorização para acesso à área, respeitar rotas, sinalização e orientações da Segurança da contratante. Não obstruir passagens e saídas de emergência. Manter área limpa ao final.",
    ppe: "Calçado de segurança. Demais EPIs conforme orientação da contratante para o local"
  }
];

export function getContractorRiskSuggestions(scope: string): ContractorRiskItem[] {
  const normalized = (scope || "").toLowerCase();
  const items = CONTRACTOR_RISK_CATALOG.filter((item) => 
    item.keywords.some((keyword) => normalized.includes(keyword))
  );
  const map = new Map<string, ContractorRiskItem>();
  items.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}
