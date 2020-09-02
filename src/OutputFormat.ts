import {Writer} from './IonWriter';
import {
    makePrettyWriter,
    makeBinaryWriter,
    makeTextWriter
} from './Ion';

export enum OutputFormat {
    PRETTY = "pretty",
    TEXT = "text",
    BINARY = "binary",
    EVENTS = "events",
    NONE = "none"
}

export namespace OutputFormat {
    export function createIonWriter(name: OutputFormat) : Writer | null {
        switch (name) {
            case OutputFormat.PRETTY:
                return makePrettyWriter();
            case OutputFormat.TEXT:
                return makeTextWriter();
            case OutputFormat.BINARY:
                return makeBinaryWriter();
            case OutputFormat.EVENTS:
                return makePrettyWriter();
            case OutputFormat.NONE:
                return null;
            default:
                throw new Error("Output Format " + name + " unexpected.");
        }
    }
}