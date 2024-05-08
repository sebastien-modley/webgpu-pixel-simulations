export default function shader_visuals(): string {
    return /* wgsl */ `
            @group(0) @binding(0) var<uniform> grid: vec2f;
            @group(0) @binding(1) var<storage> cellState: array<u32>;

            struct VertexInput {
                @location(0) pos: vec2f,
                @builtin(instance_index) instance: u32                
            };

            struct VertexOutput {
                @builtin(position) gridPos: vec4f,
                @location(0) cell: vec2f,
            };

            @vertex
            fn vertexMain(input: VertexInput) -> VertexOutput {
                let i = f32(input.instance);
                let cell = vec2f(i%grid.x,floor(i/grid.x));
                let state = f32(cellState[input.instance]);

                let cellOffset = cell / grid * 2;
                let gridPos = (input.pos*state+1) / grid - 1 + cellOffset;

                //make output
                var output: VertexOutput;
                output.gridPos = vec4f(gridPos,0,1);
                output.cell = cell;
                return output;
            }

            @fragment
            fn fragmentMain(@location(0) cell: vec2f) -> @location(0) vec4f {
                let rg = cell/grid;
                return vec4f(rg,1-rg.x,1);
            }
        `;
}
