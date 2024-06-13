var binding = -1; //so that ++binding starts at 0
export const shader_data = /* wgsl */ `

    struct Pixel {
        wood:f32,
        fire:f32,
        fireDirection:vec2f
    };

    struct ColourCheckpoint {
        colour:vec4f,
        checkpoint:f32
    };
    

    //grid dimensions
    @group(0) @binding(${++binding}) var<uniform> grid:vec2u; 
    //1 for each cell
    @group(0) @binding(${++binding}) var<storage> cellStateIn: array<Pixel>;
    @group(0) @binding(${++binding}) var<storage, read_write> cellStateOut: array<Pixel>;
    //9 for each cell (itself + each neighbour)
    @group(0) @binding(${++binding}) var<storage, read_write> neighbourhood_intent: array<Pixel>;
    @group(0) @binding(${++binding}) var<storage, read_write> neighbourhood_maintain: array<Pixel>;
    @group(0) @binding(${++binding}) var<uniform> time: f32;

    
    @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__noise_A: f32;
    @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__noise_B: f32;
    @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__focus_A: f32;
    @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__focus_B: f32;
    @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__spread: f32;


    @group(0) @binding(${++binding}) var<uniform> mouse_pos: vec2f;

    @group(0) @binding(${++binding}) var<uniform> fireColourCheckpointsCount: i32;
    @group(0) @binding(${++binding}) var<storage> fireColourCheckpoints: array<ColourCheckpoint>;
    
`;
