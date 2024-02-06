import React, { createContext, useContext, useEffect, useState } from "react";
import { GDriveContext } from "./GDriveProvider";
import _ from "lodash";

export const GDJsonDatabaseContext = createContext();

export default function GDJsonDatabaseProvider(props) {
    const G = useContext(GDriveContext);

    const _version = '1.0';

    const debug = (props.debug ?? false) === true;
    let database = (props.database ?? 'db').trim();
    let extension = database.split('.').pop();
    if (extension.toLowerCase() !== 'json') extension = 'json';
    database += `.${extension}`;
    const folderId = props.folderId ?? G.folders.rootId;

    const [data, setData] = useState({ version: _version, tables: [] });
    const [loaded, setLoaded] = useState(false);

    const _columnsTransformer = (columns) => {
        let cs = Array.isArray(columns ?? []) ? columns : []
        cs = cs
            .map((c) => {
                if (!c.name || !c.type) return null;
                let n = c.name.trim();
                let t = c.type.trim().toLowerCase();
                const ai = c.ai ? c.ai === true : null;

                if (t !== 'string'
                    && t !== 'number'
                    && t !== 'boolean'
                    && t !== 'array'
                    && t !== 'date') t = 'string';
                let ret = { name: n, type: t };
                if (t === 'number') ret = { ...ret, ai: ai ?? false };

                if (c.default) ret = { ...ret, default: _valueConverter(t, c.default) };

                return ret;
            })
            .filter((c) => c !== null);
        return cs;
    };

    const _valueConverter = (type, value) => {
        try {
            return {
                string: _.toString(value),
                number: _.toNumber(value),
                boolean: `${value}`.trim().toLowerCase() === 'true',
                array: _.toArray(value),
                date: new Date(Date.parse(`${value}`)),
            }[type];
        } catch (error) {
            return value;
        }
    };

    const _dataTransformer = (columns, data) => {
        let dt = [];
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                let d = data[i];
                if (Array.isArray(d) && d.length === columns.length) {
                    for (let i = 0; i < d.length; i++) {
                        const t = columns[i]?.type ?? 'string';
                        d[i] = _valueConverter(t, d[i]);
                    }
                    dt.push(d);
                }
            }
        }
        return dt;
    };

    const _databaseTransformer = (jsonDatabase) => {
        let d = { ...jsonDatabase, version: _version };
        if (!d.tables) d = { ...d, tables: [] };

        let tableDelete = [];
        for (const [tName, tValue] of Object.entries(d.tables)) {
            const cs = _columnsTransformer(tValue.columns ?? []);
            if (cs.length === 0) {
                tableDelete.push(tName);
                continue;
            }

            const dt = _dataTransformer(cs, tValue.data ?? []);

            d.tables[tName] = { ...d.tables[tName], columns: cs, data: dt };
        }
        for (const tName in tableDelete) delete (d.tables[tName]);

        return d;
    };

    const read = async (fileId) => {
        const loadedData = await G.readFile(fileId);
        return JSON.parse(loadedData);
    };

    const load = (fileId) => {
        read(fileId).then((loadedData) => {
            setData(loadedData);
            setLoaded(true);
        });
    };

    const save = () => {
        G.writeJson(database, folderId, data).then((fileId) => load(fileId));
    };

    const get = () => {
        return data;
    };

    const set = (newData) => {
        if ((newData.version ?? '') !== _version) return false;

        const d = _databaseTransformer(newData);
        setData(d);

        save();
        return true;
    };

    const version = () => data.version ?? _version;

    // .tables - Tables object
    // get: get all tables name
    // add: add new table with columns
    const tables = () => {
        const _add = (name, columns = []) => {
            const cs = _columnsTransformer(columns);
            if (name.trim() === '' || cs.length === 0) return false;

            setData((old) => ({ ...old, 'tables': { ...old.tables, [`${name.trim()}`]: { columns: cs, data: [] } } }));
            return true;
        };

        return {
            get: () => Object.keys(data.tables ?? []),
            add: _add
        };
    };

    // .table - Table object from name
    // columns: columns list,
    // delete: delete this table,
    // find: find clause,
    // all: all rows
    const table = (name) => {
        if (!Object.keys(data.tables).includes(name)) return null;

        const t = data.tables[name];
        const columnNames = t.columns.map((c) => c.name);

        const _updateData = (newData) => {
            setData((old) => ({ ...old, tables: { ...old.tables, [name]: { ...old.tables[name], data: newData } } }));
        };

        const _withColumnNames = (row) => {
            let r = {};
            for (let i = 0; i < row.length; i++) r[columnNames[i]] = row[i];
            return r;
        };

        const _withoutColumnNames = (row) => Object.values(row);

        const _columnFromName = (columnName) => {
            return (data.tables[name].columns.filter((c) => c.name === columnName) ?? [null])[0];
        };

        const _deleteTable = () => {
            setData((old) => {
                const tables = Object.fromEntries(
                    Object.entries(old.tables).filter(
                        ([key, val]) => key !== name.trim()
                    )
                );
                return { ...old, tables };
            });
        };

        // .get | .first
        // rows: list of rows with selected keys
        // limit: limited by offset and length of selected rows
        const _select = (data, keys = null) => {
            let ret = data;
            if (!Array.isArray(ret)) ret = [ret];

            if (Array.isArray(keys)) {
                const wantedKeys = keys.filter((key) => columnNames.includes(key));
                let selected = [];
                for (let i = 0; i < data.length; i++) {
                    const row = data[i];
                    let selectedRow = {};
                    for (const key of wantedKeys) {
                        if (Object.keys(row).includes(key)) selectedRow[key] = row[key];
                    }
                    if (Object.keys(selectedRow).length > 0) selected.push(selectedRow);
                }
                ret = selected;
            }

            // .limit
            // rows: list of rows with selected keys
            const _limit = (offset = 0, limit = -1) => {
                let _offset = offset >= 0 ? offset : 0;
                let _limit = limit < 0 ? ret.length - _offset : limit;
                if (_offset + _limit > ret.length) _limit = ret.length - _offset;

                return {
                    rows: () => ret.slice(_offset, _offset + _limit)
                }
            };

            return {
                rows: () => ret,
                limit: _limit
            };
        };

        const _first = (list) => Array.isArray(list) && list.length > 0 ? list[0] : [];

        // .find
        // get: get rows with selected keys,
        // orderBy: order rows by keys and order,
        // first: get first row with selected keys
        // delete: delete found rows
        // insert: insert new row
        const _find = (filter) => {
            if (typeof filter !== 'function') return null;

            const _get = t.data
                .filter((row) => filter(_withColumnNames(row)))
                .map((row) => _withColumnNames(row));

            // .orderBy
            // get: get rows with selected keys,
            // first: get first row with selected keys
            const _orderBy = (orders = {}) => {
                let ordersKeys = Object.keys(orders)
                    .filter((by) => {
                        const order = `${orders[by]}`.trim().toLocaleLowerCase();
                        return columnNames.includes(by) && (order === 'asc' || order === 'desc')
                    })
                    .reduce((obj, key) => {
                        if (!(key in obj)) {
                            const order = `${orders[key]}`.trim().toLocaleLowerCase();
                            obj[key] = order;
                        }
                        return obj;
                    }, {})

                if (Object.keys(ordersKeys).length === 0) ordersKeys = { id: 'asc' };

                let sorteredResult = _get;
                const _sort = (a, b, c = 0) => {
                    const by = Object.keys(ordersKeys)[c];
                    const order = ordersKeys[by];
                    let ret = 0;

                    if (_.isString(a[by]) || _.isString(b[by])) {
                        ret = `${a[by]}`.localeCompare(`${b[by]}`);
                        if (ret === -1 && order === 'desc') ret = 1;
                        else if (ret === 1 && order === 'desc') ret = -1;
                    } else {
                        if (a[by] < b[by]) ret = order === 'desc' ? 1 : -1;
                        else if (a[by] > b[by]) ret = order === 'desc' ? -1 : 1;
                    }

                    if (ret === 0) ret = (c >= Object.keys(ordersKeys).length) ? 0 : _sort(a, b, c + 1);

                    return ret;
                };
                sorteredResult.sort((a, b) => _sort(a, b));

                return {
                    get: (keys = null) => _select(sorteredResult, keys),
                    first: (keys = null) => _select(_first(sorteredResult), keys)
                };
            };

            const _delete = () => {
                let ret = data.tables[name].data;
                const found = _get.map((row) => JSON.stringify(_withoutColumnNames(row)));

                ret = ret
                    .filter((row) => !found.includes(JSON.stringify(row)))

                _updateData(ret);
            };

            const _update = (updatedData = {}) => {
                let ud = Object.fromEntries(
                    Object.entries(updatedData)
                        .filter(
                            ([key, val]) => columnNames.includes(key)
                        )
                        .map(([key, val], index) => {
                            const columnType = _columnFromName(key)?.type ?? 'string';
                            return [key, _valueConverter(columnType, val)];
                        })
                );
                if (Object.keys(ud).length === 0) return false;

                let ret = data.tables[name].data;
                const found = _get.map((row) => JSON.stringify(_withoutColumnNames(row)));

                ret = ret
                    .map((row) => _withColumnNames(row))
                    .map((row) => {
                        let result = row;
                        if (found.includes(JSON.stringify(_withoutColumnNames(row)))) result = { ...row, ...ud };
                        return _withoutColumnNames(result);
                    });

                _updateData(ret);

                return true;
            };

            return {
                get: (keys = null) => _select(_get, keys),
                orderBy: _orderBy,
                first: (keys = null) => _select(_first(_get), keys),
                delete: _delete,
                update: _update
            }
        };

        const _insert = (newData = {}) => {
            // default entries
            let nd = Object.fromEntries(
                columnNames.map((cName) => {
                    const column = _columnFromName(cName);
                    if (column?.default) return [cName, _valueConverter((column?.type ?? 'string'), column.default)]
                    return [cName, null];
                })
            );

            // new data insertions
            nd = {
                ...nd,
                ...Object.fromEntries(
                    Object.entries(newData)
                        .filter(
                            ([key, val]) => columnNames.includes(key)
                        )
                        .map(([key, val], index) => {
                            return [key, _valueConverter((_columnFromName(key)?.type ?? 'string'), val)];
                        })
                )
            };

            // auto-increments rules
            nd = Object.fromEntries(
                Object.entries(nd)
                    .map(([key, val], index) => {
                        const column = _columnFromName(key);
                        if ((column?.type ?? 'string') === 'number' && ((column?.ai ?? false) === true)) {
                            const dKey = data.tables[name].data.map((d) => _withColumnNames(d)[key]);
                            const next = Math.max(...dKey) + 1;
                            return [key, next];
                        }
                        return [key, val];
                    })
            )

            let ret = data.tables[name].data;
            ret.push(_withoutColumnNames(nd));

            _updateData(ret);

            return true;
        };

        return {
            columns: () => ({
                get: () => t.columns
            }),
            delete: _deleteTable,
            insert: _insert,
            find: _find,
            all: () => _find(() => true)
        };

    };

    useEffect(() => {
        let localLoaded = false;

        if (G.state.isAuthentificated) {
            G.fileExists(database, folderId).then((foundId) => {
                if (!localLoaded) {
                    if (foundId === false) {
                        save();
                    } else {
                        load(foundId);
                    }
                }
            });
        }

        return () => { localLoaded = true; }
    }, [G.state.isAuthentificated]);

    return <GDJsonDatabaseContext.Provider value={{
        loaded,
        get,
        set,
        save,
        version,
        tables,
        table,
    }}>
        {props.children}
    </GDJsonDatabaseContext.Provider>;
}
