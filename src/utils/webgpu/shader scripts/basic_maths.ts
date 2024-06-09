export const basic_maths = /*wgsl*/ `


fn safe_div_f32(a:f32, b:f32, valueIfZero:f32 ) -> f32 {
    let isZero = (b == 0);
    return 
        (
            a * f32(!isZero) + valueIfZero * f32(isZero)
        )
        /
        (b + f32(isZero))
    ;
}

fn safe_div_vec2f(a:vec2f, b:vec2f, valueIfZero: vec2f) -> vec2f {
    let isZero = (b == vec2f());
    return 
    (
        a * vec2f(!isZero) + valueIfZero * vec2f(isZero)
    )
    /
    (b + vec2f(isZero))
    ;
}

fn interp_weights_vec2f(a: vec2f, b:vec2f, w_a:f32, w_b:f32) -> vec2f {
    //Assuming the directions are cubic
    let w_total = w_a + w_b;
    return a * safe_div_f32(w_a,w_total, 0)
         + b * safe_div_f32(w_b,w_total, 0);
}

`;
