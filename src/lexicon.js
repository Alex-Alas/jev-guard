// Léxico de profanidad EN + ES para subtítulos en vivo.
//
// Campos de cada entrada:
//   id     identificador estable (se usa en caché y en logs)
//   lang   'es' | 'en'
//   cat    insulto | sexual | escatologico | blasfemia | slur | intensificador | interjeccion
//   sev    1 leve … 4 muy grave. Por defecto se filtra sev >= 2 (ver detector).
//   v      variantes literales (sin acentos; el detector normaliza)
//   amb    true si la palabra tiene un significado inocente común. Si Jev dice
//          que no es grosería, se MUESTRA la original. Si amb es false, aunque
//          Jev diga que fue un error, solo se muestra una corrección (alts) o se
//          deja tapada. Ver docs/DECISIONES.md (D-04).
//   safe   regex (sobre texto normalizado, ventana de la oración) que indica
//          contexto inocente. Si hay safe y no hay unsafe, no se marca.
//   unsafe regex que anula a safe.
//   bad    regex obligatoria: solo se marca si el contexto la cumple.
//   alts   palabras inocentes que el reconocedor/traductor pudo confundir con
//          esta. Se ofrecen a Jev como opciones de corrección.
//
// El léxico es deliberadamente amplio: todo lo que marque pasa por Jev, así
// que un falso positivo cuesta ~0,5 s de «…» y no un error en pantalla.

const SEXUAL = '(sexo|sexual|cama|desnud|pene|vagina|orgasm|masturb|follar|verga|polla|culo|tetas|senos|caliente|excitad|ereccion|penetr|condon|chupar|mamar|gemir|placer|nalgas|pechos)';
const WHISTLE = '(silb|arbitro|pitar|bocina|claxon|carro|coche|moto|futbol|cancha|estadio|entrenador)';
const GOAT = '(cabra|chivo|ganado|macho cabrio|granja|animal|cuerno)';
const DOG = '(perro|perrito|cachorro|ladr|raza|mascota|veterinari|animal|correa|vacuna)';
const FOX = '(zorro|animal|bosque|pelaje|madriguera)';
const SHELL = '(\\bmar\\b|playa|arena|molusco|caracol|almeja|nombre)';
const CHURCH = '(consagrada|iglesia|\\bmisa\\b|comunion|sacerdote|altar|catolic)';
const KITCHEN = '(cocina|chef|restaurante|cocinero)';
const FLOWER = '(flor|rosa|planta|jardin|seda)';
const DELAY = '(tren|vuelo|pago|reloj|entrega|proyecto|obra|trafico|autobus|avion|retrasad[oa]s? (en|por|con|unos|varios|\\d))';
const MEDICAL = '(enfermedad|infeccion|medic|tratamiento|clinica|bacteria|diagnostic)';
const NAUTICAL = '(ancla|barco|buque|mastil|\\bvela\\b)';
const LOTTERY = '(loteria|quiniela|apuesta|sorteo|premio)';

export const LEXICON = [
  // ---------------------------------------------------------------- ES
  { id: 'es_hijo_puta', lang: 'es', cat: 'insulto', sev: 4, v: ['hijo de puta', 'hija de puta', 'hijos de puta', 'hijas de puta', 'hijueputa', 'hijueputas', 'hijueperra', 'hpta', 'hdp'] },
  { id: 'es_puta_madre', lang: 'es', cat: 'intensificador', sev: 3, v: ['puta madre', 'putamadre', 'tu puta madre', 'la puta madre'] },
  { id: 'es_puta', lang: 'es', cat: 'sexual', sev: 4, v: ['puta', 'putas', 'putita', 'putitas', 'putisima', 'putisimo'], alts: ['pura', 'ruta', 'punta', 'pauta', 'bruta'] },
  { id: 'es_puto', lang: 'es', cat: 'sexual', sev: 3, v: ['puto', 'putos', 'putito'], alts: ['punto', 'pato', 'bruto', 'puro'] },
  { id: 'es_mierda', lang: 'es', cat: 'escatologico', sev: 3, v: ['mierda', 'mierdas', 'mierdero', 'mierdoso', 'mierdosa', 'mierdita'], alts: ['miedo', 'merienda'] },
  { id: 'es_cagar', lang: 'es', cat: 'escatologico', sev: 2, v: ['cagar', 'cagada', 'cagadas', 'cagon', 'cagona', 'cagado', 'cagarse', 'me cago', 'te cagas', 'se caga', 'cagando'], alts: ['cargar', 'cargada', 'cargado', 'cargando', 'pagar', 'pagado'] },
  { id: 'es_me_cago_en', lang: 'es', cat: 'blasfemia', sev: 3, v: ['me cago en dios', 'me cago en la hostia', 'me cago en tu madre', 'me cago en la puta', 'me cago en todo'] },
  { id: 'es_culo', lang: 'es', cat: 'sexual', sev: 2, v: ['culo', 'culos', 'culito', 'culazo'], alts: ['cielo', 'cupo', 'cubo', 'calo'] },
  { id: 'es_culero', lang: 'es', cat: 'insulto', sev: 3, v: ['culero', 'culera', 'culeros', 'culeras', 'culiao', 'culiado', 'culiada'] },
  { id: 'es_cabron', lang: 'es', cat: 'insulto', sev: 2, v: ['cabron', 'cabrona', 'cabrones', 'cabronas', 'cabronazo'], amb: true, safe: GOAT, unsafe: '(de mierda|hijo de|eres un|sos un)', alts: ['camion', 'carbon', 'cajon'] },
  { id: 'es_pendejo', lang: 'es', cat: 'insulto', sev: 3, v: ['pendejo', 'pendeja', 'pendejos', 'pendejas', 'pendejada', 'pendejadas', 'pendejez'], alts: ['pendiente', 'pendientes', 'consejo', 'espejo'] },
  { id: 'es_chingar', lang: 'es', cat: 'sexual', sev: 3, v: ['chingar', 'chinga', 'chingas', 'chingada', 'chingadas', 'chingado', 'chingados', 'chingando', 'chinga tu madre', 'chingada madre'], alts: ['ganar', 'ganado', 'pegar'] },
  { id: 'es_chingon', lang: 'es', cat: 'intensificador', sev: 2, v: ['chingon', 'chingona', 'chingones', 'chingonas'], amb: true },
  { id: 'es_joder', lang: 'es', cat: 'interjeccion', sev: 2, v: ['joder', 'jodido', 'jodida', 'jodidos', 'jodidas', 'jodete', 'joderse', 'jodiendo'], alts: ['poder', 'podido', 'perder', 'comer'] },
  { id: 'es_cono', lang: 'es', cat: 'interjeccion', sev: 3, v: ['coño', 'coños', 'coñazo'], alts: ['cono', 'conos', 'coro'] },
  { id: 'es_hostia', lang: 'es', cat: 'blasfemia', sev: 2, v: ['hostia', 'hostias', 'ostia'], safe: CHURCH, unsafe: '(me cago|puta|hostia puta)', alts: ['historia', 'ostra'] },
  { id: 'es_carajo', lang: 'es', cat: 'interjeccion', sev: 2, v: ['carajo', 'carajos', 'al carajo', 'del carajo'], alts: ['trabajo', 'atajo', 'caramba'] },
  { id: 'es_verga', lang: 'es', cat: 'sexual', sev: 3, v: ['verga', 'vergas', 'vergazo', 'vergon', 'vergona', 'vergueo', 'a la verga'], safe: NAUTICAL, alts: ['vega', 'berga', 'vergüenza', 'verja'] },
  { id: 'es_pinga', lang: 'es', cat: 'sexual', sev: 3, v: ['pinga', 'pingas'], alts: ['pinta', 'pila'] },
  { id: 'es_polla', lang: 'es', cat: 'sexual', sev: 2, v: ['polla', 'pollas'], amb: true, safe: LOTTERY, alts: ['pollo', 'olla', 'bolla'] },
  { id: 'es_pija', lang: 'es', cat: 'sexual', sev: 2, v: ['pija', 'pijas'], amb: true },
  { id: 'es_pito', lang: 'es', cat: 'sexual', sev: 2, v: ['pito', 'pitos'], amb: true, safe: WHISTLE, unsafe: SEXUAL + '|(mi pito|tu pito|su pito)' },
  { id: 'es_concha', lang: 'es', cat: 'sexual', sev: 2, v: ['concha', 'conchas'], amb: true, safe: SHELL, unsafe: '(tu madre|tu hermana)' },
  { id: 'es_concha_madre', lang: 'es', cat: 'insulto', sev: 4, v: ['concha de tu madre', 'conchatumadre', 'conchetumadre', 'conchetumare'] },
  { id: 'es_picha', lang: 'es', cat: 'sexual', sev: 3, v: ['picha', 'pichas', 'pichula', 'carepicha', 'careverga'] },
  { id: 'es_panocha', lang: 'es', cat: 'sexual', sev: 3, v: ['panocha', 'panochas', 'totona', 'totonas'] },
  { id: 'es_cerote', lang: 'es', cat: 'insulto', sev: 3, v: ['cerote', 'cerotes'], alts: ['cero', 'ceros', 'serote'] },
  { id: 'es_huevon', lang: 'es', cat: 'insulto', sev: 2, v: ['huevon', 'huevona', 'huevones', 'weon', 'weona', 'weones', 'huevada'], alts: ['huevo', 'huevos'] },
  { id: 'es_pelotudo', lang: 'es', cat: 'insulto', sev: 3, v: ['pelotudo', 'pelotuda', 'pelotudos', 'boludo', 'boluda', 'boludos'] },
  { id: 'es_gilipollas', lang: 'es', cat: 'insulto', sev: 3, v: ['gilipollas', 'gilipolla'] },
  { id: 'es_capullo', lang: 'es', cat: 'insulto', sev: 2, v: ['capullo', 'capullos'], amb: true, safe: FLOWER },
  { id: 'es_imbecil', lang: 'es', cat: 'insulto', sev: 2, v: ['imbecil', 'imbeciles'] },
  { id: 'es_idiota', lang: 'es', cat: 'insulto', sev: 2, v: ['idiota', 'idiotas'], amb: true },
  { id: 'es_estupido', lang: 'es', cat: 'insulto', sev: 2, v: ['estupido', 'estupida', 'estupidos', 'estupidas'], amb: true },
  { id: 'es_subnormal', lang: 'es', cat: 'slur', sev: 4, v: ['subnormal', 'subnormales', 'mongolico', 'mongolica'] },
  { id: 'es_retrasado', lang: 'es', cat: 'slur', sev: 3, v: ['retrasado', 'retrasada', 'retrasados', 'retrasadas', 'retrasado mental'], amb: true, safe: DELAY, unsafe: '(eres|sos|mental)' },
  { id: 'es_maricon', lang: 'es', cat: 'slur', sev: 4, v: ['maricon', 'maricona', 'maricones', 'marica', 'maricas', 'bollera', 'travelo'], alts: ['marcon', 'america', 'mariscos'] },
  { id: 'es_sudaca', lang: 'es', cat: 'slur', sev: 4, v: ['sudaca', 'sudacas', 'negro de mierda', 'indio de mierda'] },
  { id: 'es_zorra', lang: 'es', cat: 'insulto', sev: 3, v: ['zorra', 'zorras'], amb: true, safe: FOX, unsafe: '(puta|perra|ramera)', alts: ['sierra', 'zona'] },
  { id: 'es_perra', lang: 'es', cat: 'insulto', sev: 2, v: ['perra', 'perras'], amb: true, safe: DOG, unsafe: '(puta|zorra|hija de|maldita)', alts: ['tierra', 'guerra', 'perla'] },
  { id: 'es_ramera', lang: 'es', cat: 'insulto', sev: 3, v: ['ramera', 'rameras', 'golfa', 'golfas', 'guarra', 'guarras'] },
  { id: 'es_pinche', lang: 'es', cat: 'intensificador', sev: 2, v: ['pinche', 'pinches'], amb: true, safe: KITCHEN },
  { id: 'es_mamada', lang: 'es', cat: 'sexual', sev: 3, v: ['mamada', 'mamadas', 'mamaguevo', 'mamahuevo', 'mamaverga'], alts: ['manada', 'mañana', 'mamá'] },
  { id: 'es_ojete', lang: 'es', cat: 'sexual', sev: 2, v: ['ojete', 'ojetes', 'sorete', 'soretes'], alts: ['objeto', 'boleto'] },
  { id: 'es_gonorrea', lang: 'es', cat: 'slur', sev: 3, v: ['gonorrea', 'malparido', 'malparida', 'malparidos', 'pirobo', 'piroba'], safe: MEDICAL, unsafe: '(eres|sos|malparido)' },
  { id: 'es_coger', lang: 'es', cat: 'sexual', sev: 2, v: ['coger', 'cogiendo', 'cogerte', 'cogerla', 'cogerlo', 'cogio'], amb: true, bad: SEXUAL },
  { id: 'es_follar', lang: 'es', cat: 'sexual', sev: 3, v: ['follar', 'follando', 'follado', 'follada', 'follamos'], alts: ['fallar', 'fallando', 'fallado', 'fallamos'] },
  { id: 'es_chupame', lang: 'es', cat: 'sexual', sev: 3, v: ['chupame', 'chupamela', 'chupala', 'chupalo'] },
  { id: 'es_pajero', lang: 'es', cat: 'insulto', sev: 2, v: ['pajero', 'pajera', 'pajeros', 'hacerse la paja', 'hacerse una paja'], alts: ['pasajero', 'pasajeros', 'pajaro'] },
  { id: 'es_vete_mierda', lang: 'es', cat: 'insulto', sev: 3, v: ['vete a la mierda', 'a la mierda', 'vete al carajo', 'a la chingada', 'vete a la verga'] },
  { id: 'es_no_mames', lang: 'es', cat: 'interjeccion', sev: 2, v: ['no mames', 'no mamen', 'no manches'], amb: true, alts: ['no mandes'] },

  // ---------------------------------------------------------------- EN
  // El público ve español, pero pueden quedar palabras sin traducir, nombres
  // propios o la fuente en inglés (modo bilingüe). Se filtran igual.
  { id: 'en_fuck', lang: 'en', cat: 'sexual', sev: 4, v: ['fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuckin', 'motherfucker', 'motherfuckers', 'motherfucking', 'wtf', 'stfu'], alts: ['fork', 'folk', 'fact', 'luck', 'duck', 'truck', 'fun', 'focus'] },
  { id: 'en_shit', lang: 'en', cat: 'escatologico', sev: 3, v: ['shit', 'shits', 'shitty', 'shitting', 'bullshit', 'horseshit', 'dipshit'], alts: ['sheet', 'sit', 'ship', 'shift', 'shot', 'chip'] },
  { id: 'en_bitch', lang: 'en', cat: 'insulto', sev: 3, v: ['bitch', 'bitches', 'bitching', 'bitchy', 'sonofabitch', 'son of a bitch'], alts: ['beach', 'pitch', 'which', 'bit'] },
  { id: 'en_ass', lang: 'en', cat: 'insulto', sev: 2, v: ['ass', 'asses', 'asshole', 'assholes', 'dumbass', 'jackass', 'badass', 'smartass'], alts: ['as', 'asked', 'class', 'access'] },
  { id: 'en_dick', lang: 'en', cat: 'sexual', sev: 3, v: ['dick', 'dicks', 'dickhead', 'cock', 'cocks', 'cocksucker', 'prick', 'pricks'], amb: true, alts: ['thick', 'deck', 'clock', 'cook', 'rock', 'brick', 'price'] },
  { id: 'en_cunt', lang: 'en', cat: 'sexual', sev: 4, v: ['cunt', 'cunts', 'twat', 'pussy'], alts: ['count', "can't", 'hunt'] },
  { id: 'en_bastard', lang: 'en', cat: 'insulto', sev: 3, v: ['bastard', 'bastards'], alts: ['mustard', 'buster'] },
  { id: 'en_whore', lang: 'en', cat: 'sexual', sev: 4, v: ['whore', 'whores', 'slut', 'sluts', 'skank'], alts: ['four', 'hour', 'more', 'slot', 'slots'] },
  { id: 'en_piss', lang: 'en', cat: 'escatologico', sev: 2, v: ['piss', 'pissed', 'pissing'], alts: ['peace', 'pass', 'piece'] },
  { id: 'en_crap', lang: 'en', cat: 'escatologico', sev: 2, v: ['crap', 'crappy'], amb: true, alts: ['crop', 'wrap', 'clap'] },
  { id: 'en_damn', lang: 'en', cat: 'blasfemia', sev: 2, v: ['goddamn', 'goddamnit', 'damn it', 'dammit'] },
  { id: 'en_slur', lang: 'en', cat: 'slur', sev: 4, v: ['nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'fag', 'fags', 'retard', 'retarded', 'tranny', 'spic', 'kike'] },
  { id: 'en_wanker', lang: 'en', cat: 'insulto', sev: 3, v: ['wanker', 'wankers', 'bollocks', 'dickhead', 'jerkoff'], alts: ['banker', 'bankers', 'blocks'] }
];
