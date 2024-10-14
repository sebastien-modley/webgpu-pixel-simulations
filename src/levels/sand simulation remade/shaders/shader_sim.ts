import { shader_data } from "./shader_data";
import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes
        ${pixelMaths}

        ${shader_data}

        fn empty_array(
            data: ptr<storage, array<Pixel>, read_write>, 
            offset: u32, count: u32) {
            for (var j = 0u; j < count; j++) {
                data[offset + j] = Pixel(0, vec4f());
            }
        }

        fn cellValue(x: u32, y: u32) -> Pixel {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return Pixel(1, vec4f());}
            return cellStateIn[cellIndex(vec2u(x,y))];
        }

        fn getOffset(v: vec2u, offset: vec2i) -> vec2u {
            return vec2u(
                vec2i(v) + offset
            );
        }

        fn mooreIndex(i:u32, offset:vec2i) -> u32 {
            let offsetIndex = u32(offset.y+1) * 3 + u32(offset.x+1);
            return i*9 + offsetIndex;
        }



        const numPossibilities = 3;
        const outgoingPossibilities = array<vec2i, numPossibilities>(
            vec2i(0,-1),
            vec2i(-1,-1),
            vec2i(1,-1),
        );

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_push(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            empty_array(&neighbourhood_intent, i*9, 9);

            //empty? do nothing!
            if cellValue(cell.x, cell.y).state == 0 {
                return;
            }

            for (var j = 0; j < numPossibilities; j++) {
                let offset = outgoingPossibilities[j];
                let out_cell = getOffset(cell.xy, offset);
                //neighbour is free - declare takeover intent!
                if cellValue(out_cell.x, out_cell.y).state == 0 {
                    neighbourhood_intent[mooreIndex(i, offset)] = cellValue(cell.x,cell.y);
                    return;
                }
            }
            //nevermind... re-assign to self
            neighbourhood_intent[mooreIndex(i, vec2i(0,0))] = cellValue(cell.x,cell.y);
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_pull(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            empty_array(&neighbourhood_maintain, i*9, 9);
            
            if neighbourhood_intent[mooreIndex(i, vec2i(0,0))].state == 1 {
                return; //we're staying in place
            }

            for (var j = 0; j < numPossibilities; j++) {
                let offset = outgoingPossibilities[j];
                let i_in = cellIndex(getOffset(cell.xy, -offset));
                //if receiving intent, accept it
                if neighbourhood_intent[mooreIndex(i_in, offset)].state == 1 {
                    neighbourhood_maintain[mooreIndex(i, -offset)] = neighbourhood_intent[mooreIndex(i_in, offset)];
                    neighbourhood_intent[mooreIndex(i_in, offset)].state = 0;
                    return;
                }
            }            
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_update(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);

            //sum leftover outgoing intent and accepted incoming intent
            var sum = neighbourhood_intent[mooreIndex(i, vec2i(0,0))].state;
            var colour = select(vec4f(), neighbourhood_intent[mooreIndex(i, vec2i(0,0))].colour, neighbourhood_intent[mooreIndex(i, vec2i(0,0))].state == 1);
            for (var j = 0; j < numPossibilities; j++) {
                let offset = outgoingPossibilities[j];
                sum += neighbourhood_intent[mooreIndex(i, offset)].state;
                colour += select(vec4f(), neighbourhood_intent[mooreIndex(i, offset)].colour, neighbourhood_intent[mooreIndex(i, offset)].state == 1);
                sum += neighbourhood_maintain[mooreIndex(i, -offset)].state;
                colour += select(vec4f(), neighbourhood_maintain[mooreIndex(i, -offset)].colour, neighbourhood_maintain[mooreIndex(i, -offset)].state == 1);
            }

            //if mouse is within 2 blocks, make sand even if is not
            var max_mouse_dist = 1.0;
            let dist = length(abs(mouse_data.pos * vec2f(grid) - vec2f(cell.xy)));
            if (sum == 0 && mouse_data.down == 1 && dist < max_mouse_dist) {
                sum = 1;
                // colour = vec4f((sin(time * 0.000)+1)/2, (cos(time * 0.001)+1)/2, (cos(sin(time * 0.000001)*900)+1)/2, 1);
                colour = vec4f(sin(time*0.1)*0.3, cos(time*0.001), cos(sin(time*0.001)), 1);
            }



            cellStateOut[i] = Pixel(sum, colour);
            
        }
    `;
}
