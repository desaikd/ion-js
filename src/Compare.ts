import fs from 'fs';
import {OutputFormat} from './OutputFormat';
import {IonEventStream} from "./IonEventStream";
import {Writer} from "./IonWriter";
import {ErrorType, IonCliError, IonCompareArgs} from "./Cli";
import {IonTypes, makeReader, Reader} from "./Ion";

/**
 * The `command`, `describe`, and `handler` exports below are part of the yargs command module API
 * See: https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
 */
export const command = 'compare <input-file..>'

export const describe = "Compare all inputs (which may contain Ion streams and/or EventStreams) against all other inputs " +
    "using the Ion data model's definition of equality. Write a ComparisonReport to the output.";

export const builder = {
    'comparison-type': {
        alias: "y",
        default: 'basic',
        choices: ['basic', 'equivs', 'non-equivs', 'equivs_timeline'],
        describe: "Comparison semantics to be used with the compare command, from the set (basic | equivs | non-equivs |" +
            "equiv-timeline). Any embedded streams in the inputs are compared for EventStream equality. 'basic' performs" +
            "a standard data-model comparison between the corresponding events (or embedded streams) in the inputs." +
            "'equivs' verifies that each value (or embedded stream) in a top-level sequence is equivalent to every other" +
            "value (or embedded stream) in that sequence. 'non-equivs' does the same, but verifies that the values (or" +
            "embedded streams) are not equivalent. 'equiv-timeline' is the same as 'equivs', except that when top-level" +
            "sequences contain timestamp values, they are considered equivalent if they represent the same instant" +
            "regardless of whether they are considered equivalent by the Ion data model. [default: basic]"
    }
}

export const handler = function (argv) {
    let args = new IonCompareArgs(argv);
    new Compare(args);
}

/** Comparison semantics to be used with compare command */
export enum ComparisonType {
    BASIC = "basic",
    EQUIVS = "equivs",
    NON_EQUIVS ="non_equivs",
    EQUIVS_TIMELINE = "equivs_timeline"
}

/**
 * ComparisonContext to create a structure for lhs and rhs streams
 */
export class ComparisonContext {
    location: string;
    eventStream: IonEventStream;

    constructor(path: string, args: IonCompareArgs){
        this.location = path;
        let ionReader = this.createReadersForComparison(args);
        this.setEventStream(ionReader, args);
    }

    createReadersForComparison(args: IonCompareArgs): Reader {
        let ionReader;
        try {
            ionReader = makeReader(this.getInput(this.getLocation()));
        } catch (Error) {
            new IonCliError(ErrorType.READ, this.getLocation(), Error.message, args.getErrorReportFile()).writeErrorReport();
        }
        return ionReader;
    }

    getInput(path: string): string | Buffer {
        let options = path.endsWith(".10n") ? null : "utf8";
        return fs.readFileSync(path, options);
    }

    setEventStream(ionReader: Reader, args: IonCompareArgs) {
        this.eventStream = new IonEventStream(ionReader, this.getLocation(), args);
    }

    getEventStream() {
        return this.eventStream;
    }

    getLocation(): string {
        return this.location;
    }

    writeComparisonContext(ionOutputWriter: Writer, isLHS: boolean, event_index: number) {
        let field_name: string = isLHS ? "lhs" : "rhs";
        ionOutputWriter.writeFieldName(field_name);
        ionOutputWriter.stepIn(IonTypes.STRUCT);
        ionOutputWriter.writeFieldName("location");
        ionOutputWriter.writeString(this.location);
        ionOutputWriter.writeFieldName("event");
        this.getEventStream().getEvents()[event_index].write(ionOutputWriter);
        ionOutputWriter.stepOut();
        ionOutputWriter.writeFieldName("event_index");
        ionOutputWriter.writeInt(event_index);
    }
}


/**
 * Compare all inputs (which may contain Ion streams and/or EventStreams) against all other inputs
 * using the Ion data model's definition of equality. Write a ComparisonReport to the output.
**/
export class Compare {

    constructor(parsedArgs: IonCompareArgs) {
        let output_writer = OutputFormat.createIonWriter(parsedArgs.getOutputFormatName());
        if (output_writer) {
                this.compareFiles(output_writer, parsedArgs);
        }
    }

    compareFiles(ionOutputWriter: Writer, args: IonCompareArgs): void {
        for (let pathFirst of args.getInputFiles()) {
            for(let pathSecond of args.getInputFiles()) {
                if(pathFirst === pathSecond) {
                    continue;
                }
                let comparisonType = args.getComparisonType();
                if(comparisonType == ComparisonType.BASIC) {
                    this.compareFilePair(ionOutputWriter, pathFirst, pathSecond, args);
                }
            }
        }
    }

    compareFilePair(ionOutputWriter: Writer, pathFirst: string, pathSecond: string, args: IonCompareArgs): void {
        let lhs = new ComparisonContext(pathFirst, args);
        let rhs = new ComparisonContext(pathSecond, args);
        ionOutputWriter.close();
        lhs.getEventStream().equals(rhs.getEventStream(), lhs, rhs, args);
    }
}