var binding = -1; //so that ++binding starts at 0
export const shader_data = /* wgsl */ `
    //grid dimensions
    @group(0) @binding(${++binding}) var<uniform> grid:vec2f; 
    //1 for each cell
    struct Pixel {
        state: u32,
        colour: vec4f
    };
    @group(0) @binding(${++binding}) var<storage> cellStateIn: array<Pixel>;
    @group(0) @binding(${++binding}) var<storage, read_write> cellStateOut: array<Pixel>;
    //9 for each cell (itself + each neighbour)
    @group(0) @binding(${++binding}) var<storage, read_write> neighbourhood_intent: array<Pixel>;
    @group(0) @binding(${++binding}) var<storage, read_write> neighbourhood_maintain: array<Pixel>;


    struct Mouse_Data {
        pos: vec2f,
        down: u32
    }

    @group(0) @binding(${++binding}) var<uniform> mouse_data: Mouse_Data;
    @group(0) @binding(${++binding}) var<uniform> time: f32;

    
    @group(0) @binding(${++binding}) var<storage> simulationVisualsIn: array<vec4f>;
    @group(0) @binding(${++binding}) var<storage,read_write> simulationVisualsOut: array<vec4f>;
    const updatesInFrameArraySize = 2;
    @group(0) @binding(${++binding}) var<storage, read_write> updatesInFrame:array<u32, updatesInFrameArraySize>; 

    @group(0) @binding(${++binding}) var<uniform> bindingTag:u32; //indicates which binding instance this is
 `;
