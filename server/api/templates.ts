// 内置着色器模板
export const shaderTemplates: Record<string, string> = {
  'rainbow': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 彩虹波浪效果
  float wave1 = sin(uv.x * 10.0 + u_time * 2.0) * 0.5 + 0.5;
  float wave2 = sin(uv.y * 8.0 + u_time * 1.5) * 0.5 + 0.5;
  float wave3 = sin((uv.x + uv.y) * 6.0 + u_time) * 0.5 + 0.5;
  
  vec3 color = vec3(wave1, wave2, wave3);
  color = sin(color * 3.14159 + u_time) * 0.5 + 0.5;
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'lava': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = noise(i);
  float b = noise(i + vec2(1.0, 0.0));
  float c = noise(i + vec2(0.0, 1.0));
  float d = noise(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for(int i = 0; i < 5; i++) {
    value += amplitude * smoothNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 熔岩灯效果
  float n = fbm(uv * 3.0 + u_time * 0.3);
  n += fbm(uv * 6.0 - u_time * 0.2) * 0.5;
  
  // 熔岩颜色映射
  vec3 color1 = vec3(1.0, 0.3, 0.0);
  vec3 color2 = vec3(0.8, 0.0, 0.2);
  vec3 color3 = vec3(1.0, 0.8, 0.0);
  
  vec3 color = mix(color1, color2, n);
  color = mix(color, color3, smoothstep(0.6, 0.9, n));
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'stars': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float star(vec2 uv, float seed) {
  vec2 pos = vec2(
    random(vec2(seed, 0.0)),
    random(vec2(0.0, seed))
  );
  
  float d = length(uv - pos);
  float brightness = random(vec2(seed));
  float twinkle = sin(u_time * 2.0 + seed * 10.0) * 0.5 + 0.5;
  
  return smoothstep(0.005, 0.0, d) * brightness * (0.5 + 0.5 * twinkle);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 夜空渐变
  vec3 nightColor = mix(
    vec3(0.02, 0.02, 0.1),
    vec3(0.0, 0.0, 0.0),
    uv.y
  );
  
  // 星星
  vec3 starColor = vec3(0.0);
  for(float i = 0.0; i < 50.0; i++) {
    starColor += star(uv, i * 0.1) * vec3(1.0, 0.95, 0.8);
  }
  
  // 月亮
  vec2 moonPos = vec2(0.8, 0.8);
  float moonDist = length(uv - moonPos);
  float moon = smoothstep(0.08, 0.07, moonDist);
  vec3 moonColor = vec3(0.9, 0.9, 0.8) * moon;
  
  float glow = smoothstep(0.15, 0.0, moonDist) * 0.3;
  moonColor += vec3(0.9, 0.9, 0.8) * glow;
  
  gl_FragColor = vec4(nightColor + starColor + moonColor, 1.0);
}`,

  'fire': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = noise(i);
  float b = noise(i + vec2(1.0, 0.0));
  float c = noise(i + vec2(0.0, 1.0));
  float d = noise(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for(int i = 0; i < 4; i++) {
    value += amplitude * smoothNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  vec2 fireUV = uv;
  fireUV.y += u_time * 0.5;
  
  float n = fbm(fireUV * vec2(4.0, 8.0));
  n += fbm(fireUV * vec2(8.0, 16.0) + u_time * 0.5) * 0.5;
  
  float shape = 1.0 - uv.y;
  shape = pow(shape, 0.5);
  shape *= (1.0 - abs(uv.x - 0.5) * 1.5);
  
  float fire = n * shape;
  
  vec3 color1 = vec3(1.0, 1.0, 0.2);
  vec3 color2 = vec3(1.0, 0.5, 0.0);
  vec3 color3 = vec3(1.0, 0.0, 0.0);
  vec3 color4 = vec3(0.3, 0.0, 0.0);
  
  vec3 color = color4;
  color = mix(color, color3, smoothstep(0.0, 0.2, fire));
  color = mix(color, color2, smoothstep(0.2, 0.5, fire));
  color = mix(color, color1, smoothstep(0.5, 0.8, fire));
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'water': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 水波纹效果
  float ripple1 = sin(uv.x * 20.0 + u_time * 2.0) * 0.02;
  float ripple2 = sin(uv.y * 15.0 + u_time * 1.5) * 0.02;
  float ripple3 = sin((uv.x + uv.y) * 10.0 + u_time) * 0.02;
  
  vec2 distortedUV = uv + vec2(ripple1 + ripple3, ripple2 + ripple3);
  
  // 水色渐变
  vec3 deepWater = vec3(0.0, 0.2, 0.4);
  vec3 shallowWater = vec3(0.0, 0.5, 0.6);
  
  float depth = distortedUV.y + sin(distortedUV.x * 10.0 + u_time) * 0.1;
  vec3 waterColor = mix(shallowWater, deepWater, depth);
  
  // 高光
  float highlight = sin(distortedUV.x * 30.0 + u_time * 3.0) * 
                    sin(distortedUV.y * 30.0 + u_time * 2.0);
  highlight = smoothstep(0.8, 1.0, highlight) * 0.3;
  
  waterColor += vec3(highlight);
  
  gl_FragColor = vec4(waterColor, 1.0);
}`,

  'neon': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float grid(vec2 uv, float size) {
  vec2 grid = fract(uv * size);
  float line = step(0.95, grid.x) + step(0.95, grid.y);
  return line;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 透视网格
  vec2 center = uv - 0.5;
  float perspective = 1.0 / (center.y + 0.5);
  vec2 gridUV = vec2(center.x * perspective, perspective);
  
  // 移动网格
  gridUV.y += u_time * 0.5;
  
  // 网格线
  float g = grid(gridUV, 8.0);
  g += grid(gridUV, 24.0) * 0.5;
  
  // 地平线辉光
  float horizon = 1.0 - abs(center.y - 0.2) * 3.0;
  horizon = max(0.0, horizon);
  
  // 霓虹色
  vec3 gridColor = vec3(0.0, 1.0, 1.0);
  vec3 horizonColor = vec3(1.0, 0.0, 0.5);
  
  vec3 color = gridColor * g;
  color += horizonColor * horizon * 0.5;
  
  // 暗角
  float vignette = 1.0 - length(center) * 0.8;
  color *= vignette;
  
  gl_FragColor = vec4(color, 1.0);
}`,

  'default': `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  
  // 创建动画渐变
  vec3 color = vec3(
    0.5 + 0.5 * sin(u_time + uv.x * 3.14159),
    0.5 + 0.5 * sin(u_time + uv.y * 3.14159 + 2.0),
    0.5 + 0.5 * sin(u_time + (uv.x + uv.y) * 3.14159 + 4.0)
  );
  
  gl_FragColor = vec4(color, 1.0);
}`
}

// 关键词映射
const keywordMap: Record<string, string[]> = {
  'rainbow': ['rainbow', 'colorful', 'gradient', 'wave', 'waves', '彩虹', '波浪', '渐变', '彩色'],
  'lava': ['lava', 'blob', 'liquid', 'fluid', 'magma', '熔岩', '流体', '液体', '岩浆'],
  'stars': ['star', 'night', 'sky', 'space', 'cosmos', 'moon', '星空', '星星', '夜空', '宇宙'],
  'fire': ['fire', 'flame', 'burn', 'heat', 'hot', '火焰', '火', '燃烧', '热'],
  'water': ['water', 'ripple', 'ocean', 'sea', 'wave', 'blue', '水', '波纹', '海洋', '海浪'],
  'neon': ['neon', 'grid', 'retro', 'synthwave', 'cyber', 'digital', '霓虹', '网格', '赛博', '复古']
}

// 模板描述
const templateDescriptions: Record<string, string> = {
  'rainbow': '彩虹波浪',
  'lava': '熔岩灯',
  'stars': '星空',
  'fire': '火焰',
  'water': '水波纹',
  'neon': '霓虹网格',
  'default': '动态渐变'
}

export function findBestTemplate(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase()

  for (const [template, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        const code = shaderTemplates[template]
        if (code) return code
        break
      }
    }
  }

  return shaderTemplates['default'] || ''
}

export function getTemplateDescription(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase()

  for (const [template, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        const desc = templateDescriptions[template]
        if (desc) return desc
        break
      }
    }
  }

  return templateDescriptions['default'] || ''
}

export function getAllTemplates(): Record<string, string> {
  return shaderTemplates
}
