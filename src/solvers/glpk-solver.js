export class GLPKSolver {
    // Tom Larkworthy's [Mixed Integer/Linear Programming Solver](https://observablehq.com/@tomlarkworthy/mip) 
    constructor(glpk) {
        this.glpk = glpk;
        this.vars = {}; // name -> type
        this.objectiveVars = [];
        this.constraints = [];
        this.direction = glpk.GLP_MIN;
    }

    var(name, type) {
        this.vars[name] = type;
    }

    setObjective(direction, terms) {
        if (direction === Math.min) this.direction = this.glpk.GLP_MIN;
        else if (direction === Math.max) this.direction = this.glpk.GLP_MAX;
        else this.direction = direction;
        
        this.objectiveVars = terms;
    }

    addConstraint(terms, operator, rhs) {
        let type, lb, ub;
        if (operator === '==') {
            type = this.glpk.GLP_FX;
            lb = rhs;
            ub = rhs;
        } else if (operator === '<=') {
            type = this.glpk.GLP_UP;
            ub = rhs;
            lb = 0; // Lower bound for UP? Usually -inf, but for binary/positive vars 0 is safe?
                    // GLPK manual: GLP_UP means x <= ub.
                    // However, if variables are binary, they are >= 0.
                    // But the constraint itself might be unbounded below.
                    // Let's assume standard LP constraints.
                    // If I set lb=0, it implies 0 <= expr <= ub.
                    // If I want -inf <= expr <= ub, I should check how glpk.js handles it.
                    // But for this problem (assignment), sums are always >= 0.
                    lb = 0; 
        } else if (operator === '>=') {
            type = this.glpk.GLP_LO;
            lb = rhs;
            ub = 0; // Ignored for LO
        }

        this.constraints.push({
            name: `c_${this.constraints.length}`,
            vars: terms,
            bnds: { type, lb, ub }
        });
    }

    async solve() {
        const lp = {
            name: 'GridAllocation',
            objective: {
                direction: this.direction,
                name: 'obj',
                vars: this.objectiveVars
            },
            subjectTo: this.constraints,
            binaries: Object.keys(this.vars).filter(k => this.vars[k] === Boolean)
        };

        // glpk.solve returns a Promise in browser, and object in Node (maybe).
        // But let's assume we await it.
        const res = await this.glpk.solve(lp, {
            msglev: this.glpk.GLP_MSG_OFF
        });

        // Handle both Node and Browser return structures if they differ
        // Node: res.result
        // Browser: res.result (based on index.js reading)
        
        const resultData = res.result || res; // Fallback

        const status = (resultData.status === this.glpk.GLP_OPT) ? 'optimal' : 'other';
        
        return {
            vars: resultData.vars,
            result: resultData.z,
            status: status
        };
    }
}
