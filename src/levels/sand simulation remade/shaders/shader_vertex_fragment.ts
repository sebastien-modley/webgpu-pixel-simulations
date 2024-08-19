import { shader_data } from "./shader_data";
import { pixelMaths } from "./shader_utils";

export default function shader_vertex_fragment(): string {
    return /* wgsl */ `

        //includes
        ${pixelMaths}


        ${shader_data}

        fn overlap_color(back_color: vec4f, front_color: vec4f) -> vec4f {
            return front_color * front_color.a + back_color * (1 - front_color.a);
        }

        struct VertexInput {
            @location(0) pos: vec2f,
            @builtin(instance_index) instance: u32                
        };

        struct VertexOutput {
            @builtin(position) gridPos: vec4f,
            @location(0) @interpolate(flat) cell: vec2u,
            @location(1) @interpolate(flat) cellIndex: u32
        };

        @vertex
        fn vertexMain(input: VertexInput) -> VertexOutput {
            let i = input.instance;
            let cell = vec2u(i%u32(grid.x),i/u32(grid.x));
            let colour = simulationVisualsIn[i];
            let isCellColoured = !(isCloseToZero_vec4f(colour)).w;
            let gridf = vec2f(grid);

            let cellOffset = vec2f(cell) / gridf * 2;
            let gridPos = select(
                vec2f(), 
                (input.pos+1) / gridf - 1 + cellOffset, 
                isCellColoured
            );

            //make output
            var output: VertexOutput;
            output.gridPos = vec4f(gridPos,0,1);
            output.cell = cell;
            output.cellIndex = i;
            return output;
        }

        @fragment
        fn fragmentMain(
            @location(0) @interpolate(flat) cell: vec2u, 
            @location(1) @interpolate(flat) cellIndex: u32
        ) -> @location(0) vec4f {
            return simulationVisualsIn[cellIndex];
        }

    `;
}
