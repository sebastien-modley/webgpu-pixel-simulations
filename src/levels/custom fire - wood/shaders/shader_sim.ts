import { basic_maths } from "../../../utils/webgpu/shader scripts/basic_maths";
import { euler_maths } from "../../../utils/webgpu/shader scripts/euler_maths";
import { shader_data } from "./shader_data";
import { noiseMaths, randMaths } from "./shader_noise";
import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes
        ${pixelMaths}
        ${noiseMaths}
        ${basic_maths}
        ${euler_maths}

        fn empty_array(
            data: ptr<storage, array<Pixel>, read_write>, 
            offset: u32, count: u32) {
            for (var j = 0u; j < count; j++) {
                data[offset + j].fire = f32();
                data[offset + j].wood = f32();
                data[offset + j].fireDirection = vec2f();
            }
        }


        fn getOffset(v: vec2u, offset: vec2i) -> vec2u {
            return vec2u(
                vec2i(v) + offset
            );
        }

        fn getState(x:u32, y:u32) -> Pixel {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return Pixel();}
            return cellStateIn[cellIndex(vec2u(x,y))];

        }

        fn neighbourOffsetIndex(offset: vec2i) -> u32 {
            return u32(offset.y+1) * 3 + u32(offset.x+1);

        }

        fn mooreIndex(i:u32, offset:vec2i) -> u32 {
            return i*9 + neighbourOffsetIndex(offset);
        }


        ${shader_data}

        const numPossibilities = 3;
        const outgoingPossibilities = array<vec2i, numPossibilities>(
            vec2i(0,-1),
            vec2i(1,-1),
            vec2i(-1,-1),
        );





        fn getFireImportance(cellIndex: u32, fireDirection: vec2f, neighbourOffset: vec2i, maxAngle:f32) -> f32 {
            let angle = angle_between(fireDirection, vec2f(neighbourOffset));
            if (angle > maxAngle) {return f32();}
            let fluctuation = noise(f32(mooreIndex(cellIndex, neighbourOffset)) * time) * FIRE_BEHAVIOUR__noise_A;
            return exp( - FIRE_BEHAVIOUR__focus_A * pow((angle + fluctuation), FIRE_BEHAVIOUR__focus_B));
        }


        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_push(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}

            empty_array(&neighbourhood_intent, i*9, 9);

            let randf = rand11(f32(i)*time) * 2;
            let randu1 = u32(round(randf));
            let randu2 = u32(round((randf - trunc(randf)) * 10));

            let state = getState(cell.x, cell.y);

            var fire = state.fire;
            if (isCloseToZero(state.fire)){return;}

            let wood = state.wood;

            if (isCloseToZero(wood)) {
                //spread fire based on angle
                var angleImportancesSum = 0f;
                let fireDirection = state.fireDirection;
                let maxAngle = FIRE_BEHAVIOUR__spread;
                var importances = array<f32,9>();
                for (var x = -1; x <= 1; x++) {
                    for (var y = -1; y <= 1; y++) {
                        if (x == 0 && y == 0) {continue;}
                        importances[neighbourOffsetIndex(vec2i(x,y))] = getFireImportance(i, fireDirection, vec2i(x,y), maxAngle);
                        angleImportancesSum += importances[neighbourOffsetIndex(vec2i(x,y))];
                    }
                }
                for (var x = -1; x <= 1; x++) {
                    for (var y = -1; y <= 1; y++) {
                        if (x == 0 && y == 0) {continue;}
                        if (importances[neighbourOffsetIndex(vec2i(x,y))] == 0f) {continue;}
                        let angle_share = importances[neighbourOffsetIndex(vec2i(x,y))] / angleImportancesSum;

                        neighbourhood_intent[mooreIndex(i, vec2i(x,y))].fire = fire * angle_share;
                        neighbourhood_intent[mooreIndex(i, vec2i(x,y))].fireDirection = fireDirection;
                    }
                }
            }
            else if (wood < 25) {
                var sum_wood_neighbours = 0;
                for (var x = -1; x <= 1; x++) {
                    for (var y = -1; y <= 1; y++) {
                        let pos = getOffset(cell.xy, vec2i(x,y));
                        if (isCloseToZero(getState(pos.x, pos.y).wood)) {continue;}
                        sum_wood_neighbours++;
                    }
                }
                if (sum_wood_neighbours==0){return;}
                for (var x = -1; x <= 1; x++) {
                    for (var y = -1; y <= 1; y++) {
                        let pos = getOffset(cell.xy, vec2i(x,y));
                        if (isCloseToZero(getState(pos.x, pos.y).wood)) {continue;}
                        neighbourhood_intent[mooreIndex(i, vec2i(x, y))].fire = fire/f32(sum_wood_neighbours);
                    }
                }
                return;
            }
            else {
                neighbourhood_intent[mooreIndex(i, vec2i(0,0))].fire = fire;
                return;
            }

        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_pull(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}
    
            empty_array(&neighbourhood_maintain, i*9, 9);

            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    let i_neighbour = cellIndex(getOffset(cell.xy, vec2i(x, y)));
                    neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fire = neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fire;
                    neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fire = 0;

                    neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fireDirection = neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fireDirection;
                    neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))].fireDirection = vec2f();

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
            if !computeCellValid(cell, grid) {return;}

            //sum leftover outgoing intent and accepted incoming intent
            var fire = 0f; 
            var direction = vec2f();
            var weight_direction : f32 = 0;
            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    if !isWithinBounds(cell.xy, grid) {continue;}
                    let neighbourIncomingFire = neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fire;
                    direction = interp_weights_vec2f(direction, neighbourhood_maintain[mooreIndex(i, vec2i(x, y))].fireDirection, weight_direction, neighbourIncomingFire);
                    weight_direction += neighbourIncomingFire;
                    fire += neighbourIncomingFire;
                }
            }

            let randf = rand11(f32(i)*time);

            fire = max(0, fire - FIRE_BEHAVIOUR__noise_B * randf);
            if (cell.y == 0) {
                let spawnFireAmount = 16f;
                let spawnFireDirection =vec2f(-1,1);// vec2f(cos(time/1000f),sin(time/1000f));
                direction = interp_weights_vec2f(direction, spawnFireDirection, fire, spawnFireAmount);
                fire += spawnFireAmount;
            }

            direction = interp_weights_vec2f(direction, vec2f(0,1), fire, 0.1f);


            var wood = cellStateIn[i].wood;

            var woodBurntByFire = clamp(fire, 0, wood);


            if (!isCloseToZero(woodBurntByFire)) {
                wood -= woodBurntByFire;
                fire += log(woodBurntByFire);            
            }
            if (isCloseToZero(wood)) {
                wood = 0f;
            }

            cellStateOut[i].fire = fire;
            cellStateOut[i].fireDirection = direction;
            cellStateOut[i].wood = wood;
        }
    `;
}
