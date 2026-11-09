// Colores del tema claro (azul HWPerú). Lo usan Inicio, Historial, Perfil,
// Configuración y los componentes compartidos (cabecera y barra inferior), para
// que todas las pestañas se vean como una sola app.
export const colors = {
  header: '#1E56C9',
  headerDark: '#1747AE',
  primary: '#1F5BD8',
  primarySoft: '#E5EDFC',
  primaryText: '#1A4FBF',
  background: '#EEF3FB',
  card: '#FFFFFF',
  cardSoft: '#F6F9FE',
  border: '#E1E8F4',
  text: '#0F1B3D',
  muted: '#5B6785',
  faint: '#8D97B0',
  green: '#16A05A',
  greenSoft: '#E2F6EA',
  greenBorder: '#BFE8CF',
  orange: '#F47A1F',
  orangeSoft: '#FFEDDF',
  red: '#E5484D',
  redSoft: '#FDECEC',
  amber: '#C27803',
  amberSoft: '#FFF4D6',
};

// Sombra suave de las tarjetas: iOS usa shadow*, Android elevation.
export const cardShadow = {
  shadowColor: '#1E3A8A',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 2,
};

// Ancho máximo del contenido: en tablet o PC las tarjetas no se estiran.
export const CONTENT_MAX_WIDTH = 560;
export const WIDE_MAX_WIDTH = 1100;
