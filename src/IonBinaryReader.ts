/*
 * Copyright 2012-2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at:
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

// Binary reader.  This is a user reader built on top of
// the IonParserBinaryRaw parser.
//
// Handles system symbols, and conversion from the parsed
// input byte array  to the desired Javascript value (scalar or
// object, such as IonValue).
import { Catalog } from "./IonCatalog";
import { Decimal } from "./IonDecimal";
import { defaultLocalSymbolTable } from "./IonLocalSymbolTable";
import { getSystemSymbolTable } from "./IonSystemSymbolTable";
import { Import } from "./IonImport";
import { ion_symbol_table_sid } from "./IonSymbols";
import { IonType } from "./IonType";
import { IonTypes } from "./IonTypes";
import { IVM } from "./IonConstants";
import { LocalSymbolTable } from "./IonLocalSymbolTable";
import { makeSymbolTable } from "./IonSymbols";
import { ParserBinaryRaw } from "./IonParserBinaryRaw";
import { Reader } from "./IonReader";
import { SharedSymbolTable } from "./IonSharedSymbolTable";
import { BinarySpan } from "./IonSpan";
import { Timestamp } from "./IonTimestamp";

const RAW_STRING = new IonType( -1, "raw_input", true,  false, false, false );

const ERROR            = -3;
const BOC              = -2;//beginning of container?
const EOF              = -1;
const TB_NULL          =  0;
const TB_BOOL          =  1;
const TB_INT           =  2;
const TB_NEG_INT       =  3;
const TB_FLOAT         =  4;
const TB_DECIMAL       =  5;
const TB_TIMESTAMP     =  6;
const TB_SYMBOL        =  7;
const TB_STRING        =  8;
const TB_CLOB          =  9;
const TB_BLOB          = 10;
const TB_SEXP          = 11;
const TB_LIST          = 12;
const TB_STRUCT        = 13;
const TB_ANNOTATION    = 14;
const TB_UNUSED__      = 15;
const TB_SEXP_CLOSE    = 21;
const TB_LIST_CLOSE    = 22;
const TB_STRUCT_CLOSE  = 23;

function get_ion_type(t: number) : IonType {
  switch(t) {
    case TB_NULL:          return IonTypes.NULL;
    case TB_BOOL:          return IonTypes.BOOL;
    case TB_INT:           return IonTypes.INT;
    case TB_NEG_INT:       return IonTypes.INT;
    case TB_FLOAT:         return IonTypes.FLOAT;
    case TB_DECIMAL:       return IonTypes.DECIMAL;
    case TB_TIMESTAMP:     return IonTypes.TIMESTAMP;
    case TB_SYMBOL:        return IonTypes.SYMBOL;
    case TB_STRING:        return IonTypes.STRING;
    case TB_CLOB:          return IonTypes.CLOB;
    case TB_BLOB:          return IonTypes.BLOB;
    case TB_SEXP:          return IonTypes.SEXP;
    case TB_LIST:          return IonTypes.LIST;
    case TB_STRUCT:        return IonTypes.STRUCT;
    default:               return undefined;
  };
}

export class BinaryReader implements Reader {
  private _parser: ParserBinaryRaw;
  private _cat: Catalog;
  private _symtab: LocalSymbolTable;
  private _raw_type: number;

  constructor(source: BinarySpan, catalog?: Catalog) {
    this._parser   = new ParserBinaryRaw(source);
    this._cat      = catalog ? catalog : new Catalog();
    this._symtab   = defaultLocalSymbolTable();
    this._raw_type = BOC;
  }

    next() : IonType {
        if (this._raw_type === EOF) return undefined;
        for (this._raw_type = this._parser.next(); this.depth() === 0; this._raw_type = this._parser.next()) {
            if (this._raw_type === TB_SYMBOL) {
                let raw: number = this._parser.numberValue();
                if (raw !== IVM.sid) break;
                this._symtab = defaultLocalSymbolTable();
            } else if (this._raw_type === TB_STRUCT) {
                if (!this._parser.hasAnnotations()) break;
                if (this._parser.getAnnotation(0) !== ion_symbol_table_sid) break;
                this._symtab = makeSymbolTable(this._cat, this);
            } else {
                break;
            }
        }
        return get_ion_type(this._raw_type);
    }

  stepIn() : void {
    if (!get_ion_type(this._raw_type).container) throw new Error("Can't step in to a scalar value");
    this._parser.stepIn();
    this._raw_type = BOC;
  }

  stepOut() : void {
    this._parser.stepOut();
    this._raw_type = BOC;
  }

  valueType() : IonType {
    return get_ion_type(this._raw_type);
  }

  depth() : number {
    return this._parser.depth();
  }

  fieldName() : string {
    return this.getSymbolString(this._parser.getFieldId())
  }

  hasAnnotations() : boolean {
    return this._parser.hasAnnotations();
  }

  annotations() : string[] {//TODO binary support
      return this._parser.getAnnotations();
  }

  getAnnotation(index: number) : string {
    let t: BinaryReader = this;
    var id, n;
    id = t._parser.getAnnotation(index);
    n = this.getSymbolString(id);
    return n;
  }

  isNull() : boolean {
    let t: BinaryReader = this;
    var is_null = (t._raw_type === TB_NULL) || t._parser.isNull();
    return is_null;
  }

  stringValue() : string {
    let t: BinaryReader = this;
    var n, s, p = t._parser;
    if (t.isNull()) {
      s = "null";
      if (t._raw_type != TB_NULL) {
        s += "." + get_ion_type(t._raw_type).name;
      }
    }
    else if (get_ion_type(t._raw_type).scalar) {
      // BLOB is a scalar by you don't want to just use the string 
      // value otherwise all other scalars are fine as is
      if (t._raw_type === TB_SYMBOL) {
        n = p.numberValue();//this is returning null.
        s = this.getSymbolString(n);
      }
      else {
        s = p.stringValue();
      }
    }
    return s;
  }

  numberValue() : number {
    return this._parser.numberValue();
  }

  byteValue() : Uint8Array {
    return this._parser.byteValue();
  }

  booleanValue() : boolean {
    return this._parser.booleanValue();
  }

  decimalValue() : Decimal {
    return this._parser.decimalValue();
  }

  timestampValue() : Timestamp {
    return this._parser.timestampValue();
  }

  value() : any {
    if(this.isNull()) return null;
    switch(this.valueType()) {
      case IonTypes.NULL:
        return null;
      case IonTypes.BLOB:
      case IonTypes.CLOB:
        return this.byteValue();
      case IonTypes.BOOL:
        return this.booleanValue();
      case IonTypes.DECIMAL:
        return this.decimalValue();
      case IonTypes.FLOAT:
      case IonTypes.INT:
        return this.numberValue();
      case IonTypes.STRING:
      case IonTypes.SYMBOL:
        return this.stringValue();
      case IonTypes.TIMESTAMP:
        return this.timestampValue();
      default:
        throw new Error('Unexpected type:' + this.valueType());
    }
  }

  private getSymbolString(symbolId: number) : string {
    let s: string = null;
    if (symbolId > 0) {
      s = this._symtab.getSymbol(symbolId);
      if (typeof(s) == 'undefined') {
        s = "$" + symbolId.toString();
      }
    }
    return s;
  }
}

