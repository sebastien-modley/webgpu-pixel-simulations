export const euler_maths = /*wgsl*/ `

    fn angle_between(a:vec2f, b:vec2f) -> f32 {
        return acos(clamp(dot(a,b)/(length(a)*length(b)), -1, 1));
    }

`;
