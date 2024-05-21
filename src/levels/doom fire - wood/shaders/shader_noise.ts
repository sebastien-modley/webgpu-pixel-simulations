//Source: https://gist.github.com/munrocket/236ed5ba7e409b8bdf1ff6eca5dcdc39

export const hashMaths = /*wgsl*/ `

// https://www.pcg-random.org/
fn pcg(n: u32) -> u32 {
    var h = n * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    return (h >> 22u) ^ h;
}

fn pcg2d(p: vec2u) -> vec2u {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v ^= v >> vec2u(16u);
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v ^= v >> vec2u(16u);
    return v;
}

// http://www.jcgt.org/published/0009/03/02/
fn pcg3d(p: vec3u) -> vec3u {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
    return v;
}

// http://www.jcgt.org/published/0009/03/02/
fn pcg4d(p: vec4u) -> vec4u {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
    v ^= v >> vec4u(16u);
    v.x += v.y*v.w; v.y += v.z*v.x; v.z += v.x*v.y; v.w += v.y*v.z;
    return v;
}


// https://github.com/Cyan4973/xxHash
// https://www.shadertoy.com/view/Xt3cDn
fn xxhash32(n: u32) -> u32 {
    var h32 = n + 374761393u;
    h32 = 668265263u * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 = 2246822519u * (h32 ^ (h32 >> 15));
    h32 = 3266489917u * (h32 ^ (h32 >> 13));
    return h32^(h32 >> 16);
}

fn xxhash32_2d(p: vec2u) -> u32 {
    let p2 = 2246822519u; let p3 = 3266489917u;
    let p4 = 668265263u; let p5 = 374761393u;
    var h32 = p.y + p5 + p.x * p3;
    h32 = p4 * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 = p2 * (h32^(h32 >> 15));
    h32 = p3 * (h32^(h32 >> 13));
    return h32^(h32 >> 16);
}

fn xxhash32_3d(p: vec3u) -> u32 {
    let p2 = 2246822519u; let p3 = 3266489917u;
    let p4 = 668265263u; let p5 = 374761393u;
    var h32 =  p.z + p5 + p.x*p3;
    h32 = p4 * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 += p.y * p3;
    h32 = p4 * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 = p2 * (h32^(h32 >> 15));
    h32 = p3 * (h32^(h32 >> 13));
    return h32^(h32 >> 16);
}

fn xxhash32_4d(p: vec4u) -> u32 {
    let p2 = 2246822519u; let p3 = 3266489917u;
    let p4 = 668265263u; let p5 = 374761393u;
    var h32 = p.w + p5 + p.x * p3;
    h32 = p4 * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 += p.y * p3;
    h32 = p4 * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 += p.z  * p3;
    h32 = p4 * ((h32 << 17) | (h32 >> (32 - 17)));
    h32 = p2 * (h32^(h32 >> 15));
    h32 = p3 * (h32^(h32 >> 13));
    return h32 ^ (h32 >> 16);
}
`;

export const randMaths = /*wgsl*/ `
//include
${hashMaths}


fn rand11(f: f32) -> f32 { return f32(pcg(bitcast<u32>(f))) / f32(0xffffffff); }
fn rand22(f: vec2f) -> vec2f { return vec2f(pcg2d(bitcast<vec2u>(f))) / f32(0xffffffff); }
fn rand33(f: vec3f) -> vec3f { return vec3f(pcg3d(bitcast<vec3u>(f))) / f32(0xffffffff); }
fn rand44(f: vec4f) -> vec4f { return vec4f(pcg4d(bitcast<vec4u>(f))) / f32(0xffffffff); }

// On generating random numbers, with help of y= [(a+x)sin(bx)] mod 1", W.J.J. Rey, 22nd European Meeting of Statisticians 1998
// The following versions are PLATFORM DEPENDENT
// fn rand11(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }
// fn rand22(n: vec2f) -> f32 { return fract(sin(dot(n, vec2f(12.9898, 4.1414))) * 43758.5453); }

`;

export const noiseMaths = /*wgsl*/ `
//include
${randMaths}

    // WTFPL License
    fn noise(p: f32) -> f32 {
        let fl = floor(p);
        return mix(rand11(fl), rand11(fl + 1.), fract(p));
    }

    // WTFPL License
    fn noise2(n: vec2f) -> vec2f {
        let d = vec2f(0., 1.);
        let b = floor(n);
        let f = smoothstep(vec2f(0.), vec2f(1.), fract(n));
        return mix(mix(rand22(b), rand22(b + d.yx), f.x), mix(rand22(b + d.xy), rand22(b + d.yy), f.x), f.y);
    }


    // MIT License. © Stefan Gustavson, Munrocket
    //
    fn mod289(x: vec4f) -> vec4f { return x - floor(x * (1. / 289.)) * 289.; }
    fn perm4(x: vec4f) -> vec4f { return mod289(((x * 34.) + 1.) * x); }

    fn noise3(p: vec3f) -> f32 {
        let a = floor(p);
        var d: vec3f = p - a;
        d = d * d * (3. - 2. * d);

        let b = a.xxyy + vec4f(0., 1., 0., 1.);
        let k1 = perm4(b.xyxy);
        let k2 = perm4(k1.xyxy + b.zzww);

        let c = k2 + a.zzzz;
        let k3 = perm4(c);
        let k4 = perm4(c + 1.);

        let o1 = fract(k3 * (1. / 41.));
        let o2 = fract(k4 * (1. / 41.));

        let o3 = o2 * d.z + o1 * (1. - d.z);
        let o4 = o3.yw * d.x + o3.xz * (1. - d.x);

        return o4.y * d.y + o4.x * (1. - d.y);
    }

`;
