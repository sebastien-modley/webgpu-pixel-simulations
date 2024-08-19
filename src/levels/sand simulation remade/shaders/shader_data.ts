var binding = -1; //so that ++binding starts at 0
export const shader_data = /* wgsl */ `

    //grid dimensions
    @group(0) @binding(${++binding}) var<uniform> grid:vec2f; 
    //1 for each cell
    @group(0) @binding(${++binding}) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(${++binding}) var<storage, read_write> cellStateOut: array<u32>;
    //9 for each cell (itself + each neighbour)
    @group(0) @binding(${++binding}) var<storage, read_write> neighbourhood_intent: array<u32>;
    @group(0) @binding(${++binding}) var<storage, read_write> neighbourhood_maintain: array<u32>;

    @group(0) @binding(${++binding}) var<uniform> mouse_pos: vec2f;

    
    @group(0) @binding(${++binding}) var<storage> simulationVisualsIn: array<vec4f>;
    @group(0) @binding(${++binding}) var<storage,read_write> simulationVisualsOut: array<vec4f>;
    const updatesInFrameArraySize = 2;
    @group(0) @binding(${++binding}) var<storage, read_write> updatesInFrame:array<u32, updatesInFrameArraySize>; 

    @group(0) @binding(${++binding}) var<uniform> bindingTag:u32; //indicates which binding instance this is
 `;
