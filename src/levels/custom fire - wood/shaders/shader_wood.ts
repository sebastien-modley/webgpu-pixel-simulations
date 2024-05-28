export const woodMaths = /*wgsl*/ `

//original: https://www.shadertoy.com/view/mdy3R1
//translated using: https://eliotbo.github.io/glsl2wgsl/


fn sum2(v: vec2<f32>) -> f32 {
	return dot(v, vec2<f32>(1.));
} 

fn h31(p3: vec3<f32>) -> f32 {
	var p3_var = p3;
	p3_var = fract(p3_var * 0.1031);
	p3_var = p3_var + (dot(p3_var, p3_var.yzx + 333.3456));
	return fract(sum2(p3_var.xy) * p3_var.z);
} 

fn h21(p: vec2<f32>) -> f32 {
	return h31(p.xyx);
} 

fn n31(p: vec3<f32>) -> f32 {
	var p_var = p;
	var s: vec3<f32> = vec3<f32>(7., 157., 113.);
	let ip: vec3<f32> = floor(p_var);
	p_var = fract(p_var);
	p_var = p_var * p_var * (3. - 2. * p_var);
	var h: vec4<f32> = vec4<f32>(0., s.yz, sum2(s.yz)) + dot(ip, s);
	h = mix(fract(sin(h) * 43758.547), fract(sin(h + s.x) * 43758.547), p_var.x);
	var hxy = h.xy;
	hxy = mix(h.xz, h.yw, p_var.y);
	h.x = hxy.x;
	h.y = hxy.y;
	return mix(h.x, h.y, p_var.z);
} 

fn fbm(p: vec3<f32>, octaves: i32, roughness: f32) -> f32 {
	var roughness_var = roughness;
	var p_var = p;
	var sum: f32 = 0.;
	var amp: f32 = 1.;
	var tot: f32 = 0.;
	roughness_var = clamp(roughness_var, 0., 1.);

	for (var i: i32 = 0; i < octaves; i = i + 1) {
		sum = sum + (amp * n31(p_var));
		tot = tot + (amp);
		amp = amp * (roughness_var);
		p_var = p_var * (2.);
	}

	return sum / tot;
} 

fn randomPos(seed: f32) -> vec3<f32> {
	let s: vec4<f32> = vec4<f32>(seed, 0., 1., 2.);
	return vec3<f32>(h21(s.xy), h21(s.xz), h21(s.xw)) * 100. + 100.;
} 

fn fbmDistorted(p: vec3<f32>) -> f32 {
	var p_var = p;
	p_var = p_var + ((vec3<f32>(n31(p_var + randomPos(0.)), n31(p_var + randomPos(1.)), n31(p_var + randomPos(2.))) * 2. - 1.) * 1.12);
	return fbm(p_var, 8, 0.5);
} 

fn musgraveFbm(p: vec3<f32>, octaves: f32, dimension: f32, lacunarity: f32) -> f32 {
	var p_var = p;
	var sum: f32 = 0.;
	var amp: f32 = 1.;
	let m: f32 = pow(lacunarity, -dimension);

	for (var i: f32 = 0.; i < octaves; i = i + 1) {
		var n: f32 = n31(p_var) * 2. - 1.;
		sum = sum + (n * amp);
		amp = amp * (m);
		p_var = p_var * (lacunarity);
	}

	return sum;
} 

fn waveFbmX(p: vec3<f32>) -> vec3<f32> {
	var n: f32 = p.x * 20.;
	n = n + (0.4 * fbm(p * 3., 3, 3.));
	return vec3<f32>(sin(n) * 0.5 + 0.5, p.yz);
} 

fn remap01(f: f32, in1: f32, in2: f32) -> f32 {
	return clamp((f - in1) / (in2 - in1), 0., 1.);
} 

fn matWood(p: vec3<f32>) -> vec3<f32> {
	var n1: f32 = fbmDistorted(p * vec3<f32>(7.8, 1.17, 1.17));
	n1 = mix(n1, 1., 0.2);
	var n2: f32 = mix(musgraveFbm(vec3<f32>(n1 * 4.6), 8., 0., 2.5), n1, 0.85);
	let dirt: f32 = 1. - musgraveFbm(waveFbmX(p * vec3<f32>(0.01, 0.15, 0.15)), 15., 0.26, 2.4) * 0.4;
	let grain: f32 = 1. - smoothstep(0.2, 1., musgraveFbm(p * vec3<f32>(500., 6., 1.), 2., 2., 2.5)) * 0.2;
	n2 = n2 * (dirt * grain);
	return mix(mix(vec3<f32>(0.03, 0.012, 0.003), vec3<f32>(0.25, 0.11, 0.04), remap01(n2, 0.19, 0.56)), vec3<f32>(0.52, 0.32, 0.19), remap01(n2, 0.56, 1.));
} 

`;
