export class EventStreamError extends Error {
    type: string;
    index: number;

    constructor(type: string, message: string, index: number) {
        super();
        this.type = type;
        this.index = index;
        this.message = message;
    }
}