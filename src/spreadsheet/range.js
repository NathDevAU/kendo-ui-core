(function(f, define){
    define([ "../kendo.core", "../drawing/text-metrics" ], f);
})(function(){

(function(kendo) {
    var $ = kendo.jQuery;

    var RangeRef = kendo.spreadsheet.RangeRef;
    var UnionRef = kendo.spreadsheet.UnionRef;
    var CellRef = kendo.spreadsheet.CellRef;

    var styles = [
        "color", "fontFamily", "underline", "fontSize",
        "italic", "bold", "textAlign",
        "verticalAlign", "background"
    ];

    var borders = {
        borderTop: { complement: "borderBottom", direction: { top: -1, bottom: -1 } },
        borderLeft: { complement: "borderRight", direction: { left: -1, right: -1 } },
        borderRight: { complement: "borderLeft", direction: { left: 1, right: 1 }  },
        borderBottom: { complement: "borderTop", direction: { top: 1, bottom: 1 }  }
    };

    var Range = kendo.Class.extend({
        init: function(ref, sheet) {
            this._sheet = sheet;
            this._ref = ref;
        },

        _normalize: function(ref) {
            return this._sheet._grid.normalize(ref);
        },

        _set: function(name, value, parseStrings, recalc) {
            var sheet = this._sheet;
            this._ref.forEach(function(ref) {
                ref = ref.toRangeRef();
                // TODO: update this - should be changed to dependant formula
                if (name == "formula") {
                    sheet._set(ref, "compiledFormula", null);
                }
                sheet._set(ref, name, value, parseStrings);
            });
            sheet.triggerChange({ recalc: name == "formula" || name == "value", value: value, ref: this._ref });
            return this;
        },

        _get: function(name) {
            return this._sheet._get(this._ref.toRangeRef(), name);
        },

        _property: function(name, value, parseStrings, recalc) {
            if (value === undefined) {
                return this._get(name);
            } else {
                return this._set(name, value, parseStrings, recalc);
            }
        },

        value: function(value, parseStrings) {
            return this._property("value", value, parseStrings, true);
        },

        _resizedRef: function(direction) {
            return this._ref.map(function(ref) {
                return ref.toRangeRef().resize(direction);
            });
        },

        _border: function(property, value) {
            var result;
            var complement = borders[property].complement;
            var direction = borders[property].direction;
            var sheet = this._sheet;

            sheet.batch(function() {
                result = this._property(property, value);

                if (value !== undefined) {
                    this._resizedRef(direction).forEach(function(ref) {
                        if (ref !== kendo.spreadsheet.NULLREF) {
                            new Range(ref, sheet)._property(complement, null);
                        }
                    });
                }
            }.bind(this), {});

            return result;
        },

        _collapsedBorder: function(property) {
            var result = this._property(property);
            var complement = borders[property].complement;
            var direction = borders[property].direction;

            this._resizedRef(direction).forEach(function(ref) {
                if (!result && ref !== kendo.spreadsheet.NULLREF) {
                    var range = new Range(ref, this._sheet);
                    result = range._property(complement);
                }
            }.bind(this));

            return result;
        },

        borderTop: function(value) {
            return this._border("borderTop", value);
        },
        borderRight: function(value) {
            return this._border("borderRight", value);
        },
        borderBottom: function(value) {
            return this._border("borderBottom", value);
        },
        borderLeft: function(value) {
            return this._border("borderLeft", value);
        },

        collapsedBorderTop: function() {
            return this._collapsedBorder("borderTop");
        },
        collapsedBorderRight: function() {
            return this._collapsedBorder("borderRight");
        },
        collapsedBorderBottom: function() {
            return this._collapsedBorder("borderBottom");
        },
        collapsedBorderLeft: function() {
            return this._collapsedBorder("borderLeft");
        },

        _editableValue: function(value) {
            if (value !== undefined) {
                if ((/^=/).test(value)) {
                    this.formula(value);
                } else {
                    this._sheet.batch(function() {
                        this.formula(null);
                        this.value(value);
                    }.bind(this), { recalc: true, value: value, ref: this._ref });
                }

                return this;
            } else {
                value = this._get("value");
                var type = typeof value;
                var format = this._get("format");
                var formula = this._get("formula");

                if (formula) {
                    value = formula;
                } else if (format && kendo.spreadsheet.formatting.type(value, format) === "date") {
                    value = kendo.toString(kendo.spreadsheet.numberToDate(value), kendo.culture().calendar.patterns.d);
                } else if (type === "string") {
                    var parsed = kendo.spreadsheet.Sheet.parse(value, true);

                    if (parsed.type === "number") {
                        value = "'" + value;
                    }
                }

                return value;
            }
        },

        format: function(value) {
            return this._property("format", value);
        },

        formula: function(value) {
            if (value === null) {
                var sheet = this._sheet;
                sheet.batch(function() {
                    this._property("formula", null);
                    this.value(null);
                }.bind(this), { recalc: true });

                return this;
            }

            return this._property("formula", value, false, true);
        },

        merge: function() {
            var sheet = this._sheet;
            var mergedCells = sheet._mergedCells;

            sheet.batch(function() {
                this._ref = this._ref.map(function(ref) {
                    if (ref instanceof kendo.spreadsheet.CellRef) {
                        return ref;
                    }

                    var currentRef = ref.toRangeRef().union(mergedCells, function(ref) {
                        mergedCells.splice(mergedCells.indexOf(ref), 1);
                    });

                    var range = new Range(currentRef, sheet);
                    var value = range.value();
                    var format = range.format();
                    var background = range.background();

                    range.value(null);
                    range.format(null);
                    range.background(null);

                    var topLeft = new Range(currentRef.collapse(), sheet);

                    topLeft.value(value);
                    topLeft.format(format);
                    topLeft.background(background);

                    mergedCells.push(currentRef);
                    return currentRef;
                });

            }.bind(this), {});

            return this;
        },

        unmerge: function() {
            var mergedCells = this._sheet._mergedCells;

            this._ref.forEach(function(ref) {
                ref.toRangeRef().intersecting(mergedCells).forEach(function(mergedRef) {
                    mergedCells.splice(mergedCells.indexOf(mergedRef), 1);
                });
            });

            this._sheet.triggerChange({});

            return this;
        },

        select: function() {
            this._sheet.select(this._ref);

            return this;
        },

        values: function(values) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (this._ref === kendo.spreadsheet.NULLREF) {
                if (values !== undefined) {
                    throw new Error("Unsupported for NULLREF.");
                } else {
                    return [];
                }
            }

            var ref = this._ref.toRangeRef();
            var topLeftRow = ref.topLeft.row;
            var topLeftCol = ref.topLeft.col;
            var bottomRightRow = ref.bottomRight.row;
            var bottomRightCol = ref.bottomRight.col;
            var ci, ri;

            if (values === undefined) {
                values = new Array(ref.height());

                for (var vi = 0; vi < values.length; vi++) {
                    values[vi] = new Array(ref.width());
                }

                for (ci = topLeftCol; ci <= bottomRightCol; ci ++) {
                    for (ri = topLeftRow; ri <= bottomRightRow; ri ++) {
                        values[ri - topLeftRow][ci - topLeftCol] = this._sheet._value(ri, ci);
                    }
                }

                return values;
            } else {
                for (ci = topLeftCol; ci <= bottomRightCol; ci ++) {
                    for (ri = topLeftRow; ri <= bottomRightRow; ri ++) {
                        var row = values[ri - topLeftRow];

                        if (row) {
                            var value = row[ci - topLeftCol];

                            if (value !== undefined) {
                                this._sheet._value(ri, ci, value);
                            }
                        }
                    }
                }

                this._sheet.triggerChange({ recalc: true });

                return this;
            }
        },

        clear: function(options) {
            var clearAll = !options || !Object.keys(options).length;

            var sheet = this._sheet;

            var reason = {
                recalc: clearAll || (options && options.contentsOnly === true)
            };

            sheet.batch(function() {

                if (reason.recalc) {
                    this.formula(null);
                }

                if (clearAll || (options && options.formatOnly === true)) {
                    styles.forEach(function(x) {
                        this[x](null);
                    }.bind(this));
                    this.format(null);
                    this.unmerge();
                }

            }.bind(this), reason);

            return this;
        },

        clearContent: function() {
            return this.clear({ contentsOnly: true });
        },

        clearFormat: function() {
            return this.clear({ formatOnly: true });
        },

        sort: function(spec) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (spec === undefined) {
                spec = { column: 0 };
            }

            spec = spec instanceof Array ? spec : [spec];

            this._sheet._sortBy(this._ref.toRangeRef(), spec.map(function(spec, index) {
                if (typeof spec === "number") {
                    spec = { column: spec };
                }

                return {
                    index: spec.column === undefined ? index : spec.column,
                    ascending: spec.ascending === undefined ? true : spec.ascending
                };
            }));

            return this;
        },

        filter: function(spec) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (spec === false) {
                this.clearFilters();
            } else {
                spec = spec === true ? [] : spec instanceof Array ? spec : [spec];

                this._sheet._filterBy(this._ref.toRangeRef(), spec.map(function(spec, index) {
                   return {
                       index: spec.column === undefined ? index : spec.column,
                       filter: spec.filter
                   };
                }));
            }

            return this;
        },

        clearFilter: function(spec) {
            this._sheet.clearFilter(spec);
        },

        clearFilters: function() {
            var filter = this._sheet.filter();
            var spec = [];

            if (filter) {
                for (var i = 0; i < filter.columns.length; i++) {
                    spec.push(i);
                }

                this._sheet.batch(function() {
                    this.clearFilter(spec);
                    this._filter = null;
                }, { layout: true });
            }
        },

        hasFilter: function() {
            var filter = this._sheet.filter();
            return !!filter;
        },

        leftColumn: function() {
            return new Range(this._ref.leftColumn(), this._sheet);
        },

        rightColumn: function() {
            return new Range(this._ref.rightColumn(), this._sheet);
        },

        topRow: function() {
            return new Range(this._ref.topRow(), this._sheet);
        },

        bottomRow: function() {
            return new Range(this._ref.bottomRow(), this._sheet);
        },

        forEachRow: function(callback) {
            this._ref.forEachRow(function(ref) {
                callback(new Range(ref, this._sheet));
            }.bind(this));
        },

        forEachColumn: function(callback) {
            this._ref.forEachColumn(function(ref) {
                callback(new Range(ref, this._sheet));
            }.bind(this));
        },

        sheet: function() {
            return this._sheet;
        },

        topLeft: function() {
            return this._ref.toRangeRef().topLeft;
        },

        intersectingMerged: function() {
            var sheet = this._sheet;
            var mergedCells = [];

            sheet._mergedCells.forEach(function(ref) {
                if (ref.intersects(this._ref)) {
                    mergedCells.push(ref.toString());
                }
            }.bind(this));

            return mergedCells;
        },

        getState: function(propertyName) {
            var sheet = this._sheet;
            var state = {ref: this._ref.first()};
            var properties = [propertyName];
            if (!propertyName) {
                properties = kendo.spreadsheet.ALL_PROPERTIES;
                state.mergedCells = this.intersectingMerged();
            }

            if (propertyName === "border") {
                properties = ["borderLeft", "borderTop", "borderRight", "borderBottom"];
            }

            this.forEachCell(function(row, col, cell) {
                var cellState = state[row + "," + col] = {};

                properties.forEach(function(property) {
                    if (property === "_editableValue") {
                        property = "value";
                    }
                    if (cell.formula) {
                        if(property == "compiledFormula"){
                            var index = sheet._grid.index(row,col);
                            cellState.compiledFormula = sheet.compiledFormula(new CellRef(row, col));
                            return;
                        }
                        if (property === "value") {
                            return;
                        }
                    } else {
                        if (property === "formula") {
                            return;
                        }
                    }

                    cellState[property] = cell[property] || null;
                });
            });

            return state;
        },

        setState: function(state) {
            var sheet = this._sheet;
            var origin = this._ref.first();
            var rowDelta = state.ref.row - origin.row;
            var colDelta = state.ref.col - origin.col;
            var sheetName = sheet.name();

            sheet.batch(function() {
                if (state.mergedCells) {
                    this.unmerge();
                }

                this.forEachCell(function(row, col, cell) {
                    var cellState = state[(row + rowDelta)  + "," + (col + colDelta)];
                    var range = sheet.range(row, col);

                    for (var property in cellState) {
                        if (property == "compiledFormula") {
                            if (cellState.compiledFormula) {
                                var clone = cellState.compiledFormula.clone(sheetName, row, col);
                                range.formula("=" + clone.print(row, col));
                                range._set("compiledFormula", clone, null);
                            }
                        } else {
                            range[property](cellState[property]);
                        }
                    }
                });

                if (state.mergedCells) {
                    state.mergedCells.forEach(function(merged) {
                        merged = sheet._ref(merged).relative(rowDelta, colDelta, 3);
                        sheet.range(merged).merge();
                    }, this);
                }
            }.bind(this), {});
        },

        forEachCell: function(callback) {
            this._ref.forEach(function(ref) {
                this._sheet.forEach(ref.toRangeRef(), callback.bind(this));
            }.bind(this));
        },

        hasValue: function() {
            var result = false;

            this.forEachCell(function(row, col, cell) {
                if (Object.keys(cell).length !== 0) {
                    result = true;
                }
            });

            return result;
        },

        wrap: function(flag) {
            if (flag === undefined) {
                return !!this._property("wrap");
            }

            this.forEachRow(function(range) {
                var maxHeight = range.sheet().rowHeight(range.topLeft().row);

                range.forEachCell(function(row, col, cell) {
                    var width = this._sheet.columnWidth(col);
                    maxHeight = Math.max(maxHeight, kendo.spreadsheet.util.getTextHeight(cell.value, width));
                });

                range.sheet().rowHeight(range.topLeft().row, maxHeight);
            }.bind(this));

            this._property("wrap", flag);

            return this;
        }
    });

    // use $.each instead of forEach to work in oldIE
    $.each(styles, function(i, property) {
        Range.prototype[property] = function(value) {
            return this._property(property, value);
        };
    });


    function toExcelFormat(format) {
        return format.replace(/M/g, "m").replace(/'/g, '"').replace(/tt/, "am/pm");
    }

    var measureBox = $('<div style="position: absolute !important; top: -4000px !important; height: auto !important;' +
                        'padding: 1px !important; margin: 0 !important; border: 1px solid black !important;' +
                        'line-height: normal !important; visibility: hidden !important;' +
                        'white-space: normal !important; word-break: break-all !important;" />'
                     )[0];

    function getTextHeight(text, width) {
        return kendo.drawing.util.measureText(text, { baselineMarkerSize: 0, width: width + "px" }, measureBox).height;
    }

    kendo.spreadsheet.util = { getTextHeight: getTextHeight };
    kendo.spreadsheet.Range = Range;
})(window.kendo);

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
