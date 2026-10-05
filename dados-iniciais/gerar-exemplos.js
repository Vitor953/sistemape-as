/*
 * Gera o catálogo de exemplo em dados/pecas.json.
 * Rode com:  node dados/gerar-exemplos.js
 * Atenção: isso substitui o arquivo atual de peças.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ap = (montadora, modelo, anoInicio, anoFim, motor = '') => ({ montadora, modelo, anoInicio, anoFim, motor });

const catalogo = [
  ['BP-0012', 'Pastilha de freio dianteira', 'Bosch', 'Freios', 89.9, 164.9, 24, 6, 'A-01', 'Cerâmica, jogo com 4 peças', ['1987948123', 'N-1234'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.0'), ap('Volkswagen', 'Voyage', 2009, 2016, '1.6'), ap('Volkswagen', 'Saveiro', 2010, 2016, '1.6')]],

  ['BP-0031', 'Pastilha de freio dianteira', 'Fras-le', 'Freios', 71.5, 139.9, 3, 6, 'A-01', 'Jogo com 4 peças', ['PD-231'],
    [ap('Chevrolet', 'Onix', 2012, 2019, '1.0'), ap('Chevrolet', 'Prisma', 2013, 2019, '1.4')]],

  ['DF-2205', 'Disco de freio ventilado dianteiro', 'Hipper Freios', 'Freios', 128.0, 232.0, 8, 4, 'A-03', 'Unidade, 256 mm', ['HF-256D'],
    [ap('Volkswagen', 'Gol', 2008, 2016, '1.6'), ap('Volkswagen', 'Fox', 2010, 2018, '1.6')]],

  ['LF-0440', 'Lona de freio traseira', 'Cobreq', 'Freios', 54.9, 98.0, 15, 5, 'A-05', 'Jogo com 4 peças', [],
    [ap('Fiat', 'Uno', 2011, 2021, '1.0'), ap('Fiat', 'Mobi', 2016, 2024, '1.0')]],

  ['FL-9901', 'Filtro de óleo', 'Tecfil', 'Filtros', 14.9, 31.9, 62, 20, 'B-02', 'Rosqueável', ['PSL-560', 'W712'],
    [ap('Chevrolet', 'Onix', 2012, 2024, '1.0'), ap('Chevrolet', 'Corsa', 2002, 2012, '1.0'), ap('Chevrolet', 'Celta', 2000, 2015, '1.0')]],

  ['FL-9912', 'Filtro de óleo', 'Mann-Filter', 'Filtros', 26.5, 52.9, 30, 12, 'B-02', 'Rosqueável', ['W811/80'],
    [ap('Toyota', 'Corolla', 2009, 2019, '1.8'), ap('Toyota', 'Etios', 2013, 2021, '1.5'), ap('Toyota', 'Yaris', 2018, 2024, '1.5')]],

  ['FA-3320', 'Filtro de ar do motor', 'Tecfil', 'Filtros', 28.0, 58.9, 19, 8, 'B-04', 'Elemento retangular', ['ARL-4210'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.0'), ap('Volkswagen', 'Fox', 2004, 2018, '1.6')]],

  ['FC-1180', 'Filtro de cabine com carvão ativado', 'Wega', 'Filtros', 32.0, 68.0, 11, 6, 'B-05', 'Antipólen', ['AKX-1234'],
    [ap('Hyundai', 'HB20', 2013, 2024, '1.0'), ap('Hyundai', 'Creta', 2017, 2024, '1.6')]],

  ['FC-7702', 'Filtro de combustível', 'Bosch', 'Filtros', 38.9, 79.9, 0, 5, 'B-06', 'Linha flex', ['0986450121'],
    [ap('Fiat', 'Palio', 2008, 2017, '1.4'), ap('Fiat', 'Siena', 2008, 2016, '1.4'), ap('Fiat', 'Strada', 2009, 2020, '1.4')]],

  ['VI-4410', 'Vela de ignição iridium', 'NGK', 'Ignição', 48.0, 92.9, 40, 16, 'C-01', 'Unidade', ['ILZKR7B11', '90919-01253'],
    [ap('Toyota', 'Corolla', 2009, 2019, '1.8'), ap('Toyota', 'Etios', 2013, 2021, '1.5')]],

  ['VI-4402', 'Vela de ignição', 'Bosch', 'Ignição', 16.9, 34.9, 88, 24, 'C-01', 'Unidade, eletrodo de níquel', ['SP-04', 'F000KE0P04'],
    [ap('Volkswagen', 'Gol', 2009, 2018, '1.0'), ap('Chevrolet', 'Celta', 2003, 2015, '1.0'), ap('Fiat', 'Uno', 2011, 2020, '1.0')]],

  ['BI-5520', 'Bobina de ignição', 'Magneti Marelli', 'Ignição', 148.0, 269.0, 6, 3, 'C-03', 'Bobina de quatro saídas', ['BI-0025MM'],
    [ap('Fiat', 'Palio', 2008, 2017, '1.0'), ap('Fiat', 'Uno', 2010, 2019, '1.0')]],

  ['CV-6601', 'Cabo de vela', 'NGK', 'Ignição', 96.0, 178.0, 9, 4, 'C-04', 'Jogo completo', ['SCN-52'],
    [ap('Volkswagen', 'Gol', 2000, 2014, '1.0'), ap('Volkswagen', 'Parati', 2000, 2012, '1.6')]],

  ['AM-1101', 'Amortecedor dianteiro', 'Cofap', 'Suspensão', 210.0, 389.0, 7, 4, 'D-01', 'Unidade, pressurizado', ['GP-30123'],
    [ap('Chevrolet', 'Onix', 2012, 2019, '1.0'), ap('Chevrolet', 'Prisma', 2013, 2019, '1.4')]],

  ['AM-1108', 'Amortecedor traseiro', 'Monroe', 'Suspensão', 168.0, 312.0, 2, 4, 'D-01', 'Unidade', ['MO-23451'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.0'), ap('Volkswagen', 'Voyage', 2009, 2016, '1.6')]],

  ['BS-2210', 'Bandeja de suspensão dianteira esquerda', 'Nakata', 'Suspensão', 176.0, 318.0, 4, 2, 'D-03', 'Com pivô montado', ['NBA-2210'],
    [ap('Ford', 'Ka', 2015, 2021, '1.0'), ap('Ford', 'Fiesta', 2014, 2019, '1.6')]],

  ['PV-2255', 'Pivô de suspensão', 'Nakata', 'Suspensão', 62.0, 118.0, 16, 6, 'D-04', 'Unidade', ['N-99123'],
    [ap('Fiat', 'Strada', 2010, 2020, '1.4'), ap('Fiat', 'Palio', 2008, 2017, '1.0')]],

  ['TD-3310', 'Terminal de direção', 'Viemar', 'Direção', 54.0, 104.9, 21, 8, 'D-06', 'Lado direito', ['VM-3310'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.0'), ap('Volkswagen', 'Fox', 2004, 2018, '1.0')]],

  ['CP-7010', 'Correia dentada', 'Gates', 'Motor', 78.0, 142.0, 13, 5, 'E-01', '123 dentes', ['5350XS'],
    [ap('Fiat', 'Palio', 2005, 2016, '1.0'), ap('Fiat', 'Uno', 2010, 2019, '1.0')]],

  ['CP-7022', 'Kit correia dentada com tensor', 'Contitech', 'Motor', 268.0, 458.0, 3, 2, 'E-01', 'Correia mais tensor', ['CT1028K2'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.6'), ap('Volkswagen', 'Voyage', 2009, 2016, '1.6')]],

  ['BD-8801', 'Bomba d\u00e1gua', 'Urba', 'Arrefecimento', 132.0, 248.0, 5, 3, 'E-04', 'Com junta', ['UB-8801'],
    [ap('Chevrolet', 'Corsa', 2002, 2012, '1.0'), ap('Chevrolet', 'Celta', 2003, 2015, '1.0')]],

  ['VT-8820', 'Válvula termostática', 'Wahler', 'Arrefecimento', 62.0, 118.0, 10, 4, 'E-05', '87 graus', ['WH-4214'],
    [ap('Volkswagen', 'Gol', 2009, 2018, '1.6'), ap('Volkswagen', 'Saveiro', 2010, 2020, '1.6')]],

  ['RD-8840', 'Radiador', 'Valeo', 'Arrefecimento', 412.0, 728.0, 2, 1, 'E-08', 'Sem ar-condicionado', ['VL-732145'],
    [ap('Fiat', 'Uno', 2011, 2021, '1.0'), ap('Fiat', 'Mobi', 2016, 2023, '1.0')]],

  ['EM-9010', 'Bateria 60 Ah', 'Moura', 'Elétrica', 398.0, 649.0, 12, 4, 'F-01', '18 meses de garantia', ['M60GD'],
    [ap('Volkswagen', 'Gol', 2000, 2024, ''), ap('Chevrolet', 'Onix', 2012, 2024, ''), ap('Fiat', 'Uno', 2010, 2024, '')]],

  ['EM-9021', 'Alternador 90 A', 'Bosch', 'Elétrica', 620.0, 1090.0, 1, 2, 'F-03', 'Remanufaturado', ['0986049151'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.6'), ap('Volkswagen', 'Fox', 2010, 2018, '1.6')]],

  ['EM-9033', 'Motor de partida', 'Valeo', 'Elétrica', 540.0, 958.0, 2, 1, 'F-04', 'Unidade', ['VL-458231'],
    [ap('Chevrolet', 'Onix', 2012, 2019, '1.0'), ap('Chevrolet', 'Prisma', 2013, 2019, '1.0')]],

  ['SN-9501', 'Sensor de oxigênio (sonda lambda)', 'NGK', 'Injeção', 188.0, 342.0, 4, 2, 'F-06', 'Quatro fios, pré-catalisador', ['OZA-659'],
    [ap('Hyundai', 'HB20', 2013, 2022, '1.0'), ap('Hyundai', 'HB20S', 2013, 2022, '1.6')]],

  ['SN-9512', 'Sensor de rotação', 'Magneti Marelli', 'Injeção', 92.0, 172.0, 8, 3, 'F-06', 'Indutivo', ['MM-2201'],
    [ap('Fiat', 'Palio', 2008, 2017, '1.4'), ap('Fiat', 'Siena', 2008, 2016, '1.4')]],

  ['EB-4101', 'Embreagem completa', 'Luk', 'Transmissão', 486.0, 852.0, 3, 2, 'G-01', 'Platô, disco e rolamento', ['619301809'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.6'), ap('Volkswagen', 'Voyage', 2009, 2016, '1.6')]],

  ['EB-4118', 'Kit embreagem', 'Sachs', 'Transmissão', 512.0, 898.0, 0, 2, 'G-01', 'Platô, disco e rolamento', ['3000951065'],
    [ap('Toyota', 'Corolla', 2009, 2019, '1.8'), ap('Toyota', 'Etios', 2013, 2021, '1.5')]],

  ['HD-5501', 'Homocinética lado roda', 'Spicer', 'Transmissão', 218.0, 398.0, 6, 3, 'G-03', 'Com kit de montagem', ['SP-5501'],
    [ap('Chevrolet', 'Onix', 2012, 2019, '1.0'), ap('Chevrolet', 'Prisma', 2013, 2019, '1.0')]],

  ['RM-6601', 'Rolamento de roda dianteira', 'SKF', 'Rodas', 128.0, 236.0, 14, 6, 'G-05', 'Com anel magnético', ['VKBA-3644'],
    [ap('Renault', 'Sandero', 2008, 2023, '1.0'), ap('Renault', 'Logan', 2008, 2023, '1.6')]],

  ['CE-7701', 'Coxim do motor', 'Axios', 'Motor', 96.0, 178.0, 7, 3, 'E-09', 'Lado direito', ['AX-7701'],
    [ap('Ford', 'Ka', 2015, 2021, '1.0'), ap('Ford', 'Fiesta', 2014, 2019, '1.6')]],

  ['JT-7712', 'Junta do cabeçote', 'Taranto', 'Motor', 88.0, 162.0, 5, 2, 'E-10', 'Aço multilaminado', ['TR-7712'],
    [ap('Volkswagen', 'Gol', 2009, 2018, '1.0'), ap('Volkswagen', 'Fox', 2004, 2018, '1.0')]],

  ['LM-8801', 'Lâmpada H4 12 V 60/55 W', 'Philips', 'Iluminação', 22.0, 46.9, 54, 20, 'H-01', 'Unidade', ['12342PRC1'],
    [ap('Volkswagen', 'Gol', 2000, 2016, ''), ap('Fiat', 'Uno', 2005, 2020, ''), ap('Chevrolet', 'Celta', 2000, 2015, '')]],

  ['FR-8810', 'Farol dianteiro esquerdo', 'Arteb', 'Iluminação', 268.0, 478.0, 2, 1, 'H-04', 'Máscara negra', ['AR-8810E'],
    [ap('Chevrolet', 'Onix', 2012, 2016, '1.0'), ap('Chevrolet', 'Prisma', 2013, 2016, '1.4')]],

  ['PB-9902', 'Palheta limpador 16 polegadas', 'Dyna', 'Acessórios', 18.5, 39.9, 36, 12, 'H-06', 'Par', ['DY-16'],
    [ap('Volkswagen', 'Gol', 2009, 2020, ''), ap('Fiat', 'Palio', 2008, 2017, '')]],

  ['AC-3301', 'Compressor do ar-condicionado', 'Denso', 'Ar-condicionado', 1180.0, 1980.0, 1, 1, 'I-01', 'Remanufaturado', ['DN-3301'],
    [ap('Toyota', 'Corolla', 2009, 2019, '1.8'), ap('Toyota', 'Hilux', 2012, 2020, '2.8')]],

  ['AC-3312', 'Filtro secador', 'Mahle', 'Ar-condicionado', 92.0, 168.0, 5, 3, 'I-02', 'Unidade', ['MH-3312'],
    [ap('Hyundai', 'HB20', 2013, 2024, '1.0'), ap('Hyundai', 'Creta', 2017, 2024, '1.6')]],

  ['ES-1102', 'Escapamento traseiro', 'Tuper', 'Escapamento', 218.0, 386.0, 3, 1, 'J-01', 'Silencioso traseiro', ['TP-1102'],
    [ap('Volkswagen', 'Gol', 2009, 2016, '1.0'), ap('Volkswagen', 'Voyage', 2009, 2016, '1.0')]]
];

const agora = new Date().toISOString();

const pecas = catalogo.map(
  ([codigo, nome, marca, categoria, precoCusto, precoVenda, estoque, estoqueMinimo, localizacao, descricao, equivalentes, aplicacoes]) => ({
    id: crypto.randomUUID(),
    codigo,
    nome,
    marca,
    categoria,
    descricao,
    fornecedor: '',
    localizacao,
    precoCusto,
    precoVenda,
    estoque,
    estoqueMinimo,
    equivalentes,
    aplicacoes,
    criadoEm: agora,
    atualizadoEm: agora
  })
);

fs.writeFileSync(path.join(__dirname, 'pecas.json'), JSON.stringify(pecas, null, 2), 'utf8');
console.log(`Catálogo de exemplo gravado: ${pecas.length} peças em dados/pecas.json`);
