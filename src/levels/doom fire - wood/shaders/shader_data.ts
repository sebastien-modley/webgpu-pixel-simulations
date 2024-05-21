export const shader_data = /* wgsl */ `

    struct Pixel {
        isWood:u32,
        fireValue:f32,
    };

    //grid dimensions
    @group(0) @binding(0) var<uniform> grid:vec2u; 
    //1 for each cell
    @group(0) @binding(1) var<storage> cellStateIn: array<Pixel>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<Pixel>;
    //9 for each cell (itself + each neighbour)
    @group(0) @binding(3) var<storage, read_write> neighbourhood_intent: array<Pixel>;
    @group(0) @binding(4) var<storage, read_write> neighbourhood_maintain: array<Pixel>;
    @group(0) @binding(5) var<uniform> time: f32;
    
`;
