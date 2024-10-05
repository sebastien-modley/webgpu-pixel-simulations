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

    struct Colour {
        colour:vec4f
    };
    
    struct FireBehaviour {
        ground_fire_power:f32,
        mouse_torch_power:f32,
        noise_A:f32,
        noise_B:f32,
        focus_A:f32,
        focus_B:f32,
        spread:f32
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

    @group(0) @binding(${++binding}) var<uniform> fireBehaviour: FireBehaviour;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__ground_fire_power: f32;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__mouse_torch_power: f32;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__noise_A: f32;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__noise_B: f32;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__focus_A: f32;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__focus_B: f32;
    // @group(0) @binding(${++binding}) var<uniform> FIRE_BEHAVIOUR__spread: f32;


    struct Mouse_Data {
        pos: vec2f,
        down: u32
    };
    @group(0) @binding(${++binding}) var<uniform> mouse_data: Mouse_Data;

    @group(0) @binding(${++binding}) var<uniform> fireColourCheckpointsCount: i32;
    @group(0) @binding(${++binding}) var<storage> fireColourCheckpoints: array<ColourCheckpoint>;
    

    @group(0) @binding(${++binding}) var<storage> simulationVisualsIn: array<Colour>;
    @group(0) @binding(${++binding}) var<storage,read_write> simulationVisualsOut: array<Colour>;
    
    const updatesInFrameArraySize = 2;
    @group(0) @binding(${++binding}) var<storage, read_write> updatesInFrame:array<u32, updatesInFrameArraySize>; 

    @group(0) @binding(${++binding}) var<uniform> bindingTag:u32; //indicates which binding instance this is
 `;
