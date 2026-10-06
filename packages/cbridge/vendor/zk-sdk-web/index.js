let wasm;

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export_0(addHeapObject(e));
    }
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let stack_pointer = 128;

function addBorrowedObject(obj) {
    if (stack_pointer == 1) throw new Error('out of js stack');
    heap[--stack_pointer] = obj;
    return stack_pointer;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    const mem = getDataViewMemory0();
    for (let i = 0; i < array.length; i++) {
        mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

const AeCiphertextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_aeciphertext_free(ptr >>> 0, 1));

export class AeCiphertext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AeCiphertext.prototype);
        obj.__wbg_ptr = ptr;
        AeCiphertextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AeCiphertextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_aeciphertext_free(ptr, 0);
    }
    /**
     * Deserializes an `AeCiphertext` from a byte slice.
     * @param {Uint8Array} uint8_array
     * @returns {AeCiphertext | undefined}
     */
    static fromBytes(uint8_array) {
        const ret = wasm.aeciphertext_fromBytes(addHeapObject(uint8_array));
        return ret === 0 ? undefined : AeCiphertext.__wrap(ret);
    }
    /**
     * Decrypts the ciphertext. Returns the amount if successful, otherwise `undefined`.
     * @param {AeKey} key
     * @returns {bigint | undefined}
     */
    decrypt(key) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(key, AeKey);
            wasm.aeciphertext_decrypt(retptr, this.__wbg_ptr, key.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r2 = getDataViewMemory0().getBigInt64(retptr + 8 * 1, true);
            return r0 === 0 ? undefined : BigInt.asUintN(64, r2);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Serializes the `AeCiphertext` to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.aeciphertext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const AeKeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_aekey_free(ptr >>> 0, 1));

export class AeKey {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AeKey.prototype);
        obj.__wbg_ptr = ptr;
        AeKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AeKeyFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_aekey_free(ptr, 0);
    }
    /**
     * Deserializes an `AeKey` from a byte slice.
     * @param {Uint8Array} uint8_array
     * @returns {AeKey}
     */
    static fromBytes(uint8_array) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.aekey_fromBytes(retptr, addHeapObject(uint8_array));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return AeKey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Deterministically derives an `AeKey` from a BIP39 mnemonic seed
     * phrase and optional passphrase.
     * @param {string} seed_phrase
     * @param {string | null} [passphrase]
     * @returns {AeKey}
     */
    static fromSeedPhraseAndPassphrase(seed_phrase, passphrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(seed_phrase, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(passphrase) ? 0 : passStringToWasm0(passphrase, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
            var len1 = WASM_VECTOR_LEN;
            wasm.aekey_fromSeedPhraseAndPassphrase(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return AeKey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Decrypts a ciphertext. Returns the amount if successful, otherwise `undefined`.
     * @param {AeCiphertext} ciphertext
     * @returns {bigint}
     */
    decrypt(ciphertext) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(ciphertext, AeCiphertext);
            wasm.aekey_decrypt(retptr, this.__wbg_ptr, ciphertext.__wbg_ptr);
            var r0 = getDataViewMemory0().getBigInt64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return BigInt.asUintN(64, r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Encrypts a 64-bit amount.
     * @param {bigint} amount
     * @returns {AeCiphertext}
     */
    encrypt(amount) {
        const ret = wasm.aekey_encrypt(this.__wbg_ptr, amount);
        return AeCiphertext.__wrap(ret);
    }
    /**
     * Creates a new, random authenticated encryption key.
     */
    constructor() {
        const ret = wasm.aekey_new_rand();
        this.__wbg_ptr = ret >>> 0;
        AeKeyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Serializes the `AeKey` to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.aekey_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Deterministically derives an `AeKey` from a seed.
     *
     * The seed must be between 16 and 65535 bytes in length.
     * @param {Uint8Array} seed
     * @returns {AeKey}
     */
    static fromSeed(seed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.aekey_fromSeed(retptr, addHeapObject(seed));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return AeKey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedGroupedCiphertext2HandlesValidityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedgroupedciphertext2handlesvalidityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a batched grouped ciphertext 2-handles validity proof.
 */
export class BatchedGroupedCiphertext2HandlesValidityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedGroupedCiphertext2HandlesValidityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        BatchedGroupedCiphertext2HandlesValidityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedGroupedCiphertext2HandlesValidityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedgroupedciphertext2handlesvalidityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a batched grouped ciphertext 2-handles validity proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedGroupedCiphertext2HandlesValidityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext2handlesvalidityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedGroupedCiphertext2HandlesValidityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the batched grouped ciphertext 2-handles validity proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext2handlesvalidityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedGroupedCiphertext2HandlesValidityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedgroupedciphertext2handlesvalidityproofdata_free(ptr >>> 0, 1));
/**
 * A batched grouped ciphertext validity proof with two decryption handles. This proof certifies
 * the validity of two grouped ElGamal ciphertexts that are encrypted under the same public keys.
 */
export class BatchedGroupedCiphertext2HandlesValidityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedGroupedCiphertext2HandlesValidityProofData.prototype);
        obj.__wbg_ptr = ptr;
        BatchedGroupedCiphertext2HandlesValidityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedGroupedCiphertext2HandlesValidityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedgroupedciphertext2handlesvalidityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a batched grouped ciphertext validity proof with two handles from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedGroupedCiphertext2HandlesValidityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext2handlesvalidityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedGroupedCiphertext2HandlesValidityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new batched grouped ciphertext validity proof with two handles.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {GroupedElGamalCiphertext2Handles} grouped_ciphertext_lo
     * @param {GroupedElGamalCiphertext2Handles} grouped_ciphertext_hi
     * @param {bigint} amount_lo
     * @param {bigint} amount_hi
     * @param {PedersenOpening} opening_lo
     * @param {PedersenOpening} opening_hi
     */
    constructor(first_pubkey, second_pubkey, grouped_ciphertext_lo, grouped_ciphertext_hi, amount_lo, amount_hi, opening_lo, opening_hi) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(first_pubkey, ElGamalPubkey);
            _assertClass(second_pubkey, ElGamalPubkey);
            _assertClass(grouped_ciphertext_lo, GroupedElGamalCiphertext2Handles);
            _assertClass(grouped_ciphertext_hi, GroupedElGamalCiphertext2Handles);
            _assertClass(opening_lo, PedersenOpening);
            _assertClass(opening_hi, PedersenOpening);
            wasm.batchedgroupedciphertext2handlesvalidityproofdata_new(retptr, first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, grouped_ciphertext_lo.__wbg_ptr, grouped_ciphertext_hi.__wbg_ptr, amount_lo, amount_hi, opening_lo.__wbg_ptr, opening_hi.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            BatchedGroupedCiphertext2HandlesValidityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the batched grouped ciphertext 2-handles validity proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext2handlesvalidityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {BatchedGroupedCiphertext2HandlesValidityProofContext}
     */
    context() {
        const ret = wasm.batchedgroupedciphertext2handlesvalidityproofdata_context(this.__wbg_ptr);
        return BatchedGroupedCiphertext2HandlesValidityProofContext.__wrap(ret);
    }
    /**
     * Serializes the batched grouped ciphertext validity proof with two handles to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext2handlesvalidityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedGroupedCiphertext3HandlesValidityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedgroupedciphertext3handlesvalidityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a batched grouped ciphertext 3-handles validity proof.
 */
export class BatchedGroupedCiphertext3HandlesValidityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedGroupedCiphertext3HandlesValidityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        BatchedGroupedCiphertext3HandlesValidityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedGroupedCiphertext3HandlesValidityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedgroupedciphertext3handlesvalidityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a batched grouped ciphertext 3-handles validity proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedGroupedCiphertext3HandlesValidityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext3handlesvalidityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedGroupedCiphertext3HandlesValidityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the batched grouped ciphertext 3-handles validity proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext3handlesvalidityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedGroupedCiphertext3HandlesValidityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedgroupedciphertext3handlesvalidityproofdata_free(ptr >>> 0, 1));
/**
 * A batched grouped ciphertext validity proof with three decryption handles. This proof certifies
 * the validity of two grouped ElGamal ciphertexts that are encrypted under the same public keys.
 */
export class BatchedGroupedCiphertext3HandlesValidityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedGroupedCiphertext3HandlesValidityProofData.prototype);
        obj.__wbg_ptr = ptr;
        BatchedGroupedCiphertext3HandlesValidityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedGroupedCiphertext3HandlesValidityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedgroupedciphertext3handlesvalidityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a batched grouped ciphertext validity proof with three handles from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedGroupedCiphertext3HandlesValidityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext3handlesvalidityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedGroupedCiphertext3HandlesValidityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new batched grouped ciphertext validity proof with three handles.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {ElGamalPubkey} third_pubkey
     * @param {GroupedElGamalCiphertext3Handles} grouped_ciphertext_lo
     * @param {GroupedElGamalCiphertext3Handles} grouped_ciphertext_hi
     * @param {bigint} amount_lo
     * @param {bigint} amount_hi
     * @param {PedersenOpening} opening_lo
     * @param {PedersenOpening} opening_hi
     */
    constructor(first_pubkey, second_pubkey, third_pubkey, grouped_ciphertext_lo, grouped_ciphertext_hi, amount_lo, amount_hi, opening_lo, opening_hi) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(first_pubkey, ElGamalPubkey);
            _assertClass(second_pubkey, ElGamalPubkey);
            _assertClass(third_pubkey, ElGamalPubkey);
            _assertClass(grouped_ciphertext_lo, GroupedElGamalCiphertext3Handles);
            _assertClass(grouped_ciphertext_hi, GroupedElGamalCiphertext3Handles);
            _assertClass(opening_lo, PedersenOpening);
            _assertClass(opening_hi, PedersenOpening);
            wasm.batchedgroupedciphertext3handlesvalidityproofdata_new(retptr, first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, third_pubkey.__wbg_ptr, grouped_ciphertext_lo.__wbg_ptr, grouped_ciphertext_hi.__wbg_ptr, amount_lo, amount_hi, opening_lo.__wbg_ptr, opening_hi.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            BatchedGroupedCiphertext3HandlesValidityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the batched grouped ciphertext 3-handles validity proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext3handlesvalidityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {BatchedGroupedCiphertext3HandlesValidityProofContext}
     */
    context() {
        const ret = wasm.batchedgroupedciphertext3handlesvalidityproofdata_context(this.__wbg_ptr);
        return BatchedGroupedCiphertext3HandlesValidityProofContext.__wrap(ret);
    }
    /**
     * Serializes the batched grouped ciphertext validity proof with three handles to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedgroupedciphertext3handlesvalidityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedRangeProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedrangeproofcontext_free(ptr >>> 0, 1));
/**
 * The context data for a batched range proof. This context is shared by all
 * batched range proof instructions.
 */
export class BatchedRangeProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedRangeProofContext.prototype);
        obj.__wbg_ptr = ptr;
        BatchedRangeProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedRangeProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedrangeproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a batched range proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedRangeProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedRangeProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the batched range proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedRangeProofU128DataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedrangeproofu128data_free(ptr >>> 0, 1));
/**
 * A 128-bit batched range proof.
 *
 * This proof certifies that a batch of Pedersen commitments encrypt values
 * that are within specified bit ranges, summing up to 128 bits in total.
 */
export class BatchedRangeProofU128Data {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedRangeProofU128Data.prototype);
        obj.__wbg_ptr = ptr;
        BatchedRangeProofU128DataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedRangeProofU128DataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedrangeproofu128data_free(ptr, 0);
    }
    /**
     * Deserializes a 128-bit batched range proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedRangeProofU128Data}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu128data_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedRangeProofU128Data.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new 128-bit batched range proof.
     *
     * The function takes arrays of Pedersen commitments, amounts (as `BigUint64Array`),
     * bit lengths (as `Uint8Array`), and Pedersen openings. The sum of bit lengths must be 128,
     * and each bit length must be a power of two.
     *
     * # Arguments
     *
     * * `commitments` - An array of `PedersenCommitment`.
     * * `amounts` - An array of 64-bit amounts (as `BigUint64Array`).
     * * `bit_lengths` - An array of bit lengths (as `Uint8Array`).
     * * `openings` - An array of `PedersenOpening`.
     * @param {PedersenCommitment[]} commitments
     * @param {BigUint64Array} amounts
     * @param {Uint8Array} bit_lengths
     * @param {PedersenOpening[]} openings
     */
    constructor(commitments, amounts, bit_lengths, openings) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(commitments, wasm.__wbindgen_export_2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(openings, wasm.__wbindgen_export_2);
            const len1 = WASM_VECTOR_LEN;
            wasm.batchedrangeproofu128data_new(retptr, ptr0, len0, addHeapObject(amounts), addHeapObject(bit_lengths), ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            BatchedRangeProofU128DataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the 128-bit batched range proof.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu128data_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {BatchedRangeProofContext}
     */
    context() {
        const ret = wasm.batchedrangeproofu128data_context(this.__wbg_ptr);
        return BatchedRangeProofContext.__wrap(ret);
    }
    /**
     * Serializes the 128-bit batched range proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu128data_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedRangeProofU256DataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedrangeproofu256data_free(ptr >>> 0, 1));
/**
 * A 256-bit batched range proof.
 *
 * This proof certifies that a batch of Pedersen commitments encrypt values
 * that are within specified bit ranges, summing up to 256 bits in total.
 * Each individual bit length must not exceed 128.
 */
export class BatchedRangeProofU256Data {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedRangeProofU256Data.prototype);
        obj.__wbg_ptr = ptr;
        BatchedRangeProofU256DataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedRangeProofU256DataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedrangeproofu256data_free(ptr, 0);
    }
    /**
     * Deserializes a 256-bit batched range proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedRangeProofU256Data}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu256data_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedRangeProofU256Data.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new 256-bit batched range proof.
     *
     * The function takes arrays of Pedersen commitments, amounts (as `BigUint64Array`),
     * bit lengths (as `Uint8Array`), and Pedersen openings. The sum of bit lengths must be 256,
     * and each bit length must be a power of two less than or equal to 128.
     *
     * # Arguments
     *
     * * `commitments` - An array of `PedersenCommitment`.
     * * `amounts` - An array of 64-bit amounts (as `BigUint64Array`).
     * * `bit_lengths` - An array of bit lengths (as `Uint8Array`).
     * * `openings` - An array of `PedersenOpening`.
     * @param {PedersenCommitment[]} commitments
     * @param {BigUint64Array} amounts
     * @param {Uint8Array} bit_lengths
     * @param {PedersenOpening[]} openings
     */
    constructor(commitments, amounts, bit_lengths, openings) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(commitments, wasm.__wbindgen_export_2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(openings, wasm.__wbindgen_export_2);
            const len1 = WASM_VECTOR_LEN;
            wasm.batchedrangeproofu256data_new(retptr, ptr0, len0, addHeapObject(amounts), addHeapObject(bit_lengths), ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            BatchedRangeProofU256DataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the 256-bit batched range proof.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu256data_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {BatchedRangeProofContext}
     */
    context() {
        const ret = wasm.batchedrangeproofu256data_context(this.__wbg_ptr);
        return BatchedRangeProofContext.__wrap(ret);
    }
    /**
     * Serializes the 256-bit batched range proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu256data_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const BatchedRangeProofU64DataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_batchedrangeproofu64data_free(ptr >>> 0, 1));
/**
 * A 64-bit batched range proof.
 *
 * This proof certifies that a batch of Pedersen commitments encrypt values
 * that are within specified bit ranges, summing up to 64 bits in total.
 */
export class BatchedRangeProofU64Data {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BatchedRangeProofU64Data.prototype);
        obj.__wbg_ptr = ptr;
        BatchedRangeProofU64DataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BatchedRangeProofU64DataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_batchedrangeproofu64data_free(ptr, 0);
    }
    /**
     * Deserializes a 64-bit batched range proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {BatchedRangeProofU64Data}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu64data_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return BatchedRangeProofU64Data.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new 64-bit batched range proof.
     *
     * The function takes arrays of Pedersen commitments, amounts (as `BigUint64Array`),
     * bit lengths (as `Uint8Array`), and Pedersen openings. The sum of bit lengths must be 64.
     *
     * # Arguments
     *
     * * `commitments` - An array of `PedersenCommitment`.
     * * `amounts` - An array of 64-bit amounts (as `BigUint64Array`).
     * * `bit_lengths` - An array of bit lengths (as `Uint8Array`).
     * * `openings` - An array of `PedersenOpening`.
     * @param {PedersenCommitment[]} commitments
     * @param {BigUint64Array} amounts
     * @param {Uint8Array} bit_lengths
     * @param {PedersenOpening[]} openings
     */
    constructor(commitments, amounts, bit_lengths, openings) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayJsValueToWasm0(commitments, wasm.__wbindgen_export_2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(openings, wasm.__wbindgen_export_2);
            const len1 = WASM_VECTOR_LEN;
            wasm.batchedrangeproofu64data_new(retptr, ptr0, len0, addHeapObject(amounts), addHeapObject(bit_lengths), ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            BatchedRangeProofU64DataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the 64-bit batched range proof.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu64data_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {BatchedRangeProofContext}
     */
    context() {
        const ret = wasm.batchedrangeproofu64data_context(this.__wbg_ptr);
        return BatchedRangeProofContext.__wrap(ret);
    }
    /**
     * Serializes the 64-bit batched range proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.batchedrangeproofu64data_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const CiphertextCiphertextEqualityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ciphertextciphertextequalityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a ciphertext-ciphertext equality proof.
 */
export class CiphertextCiphertextEqualityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CiphertextCiphertextEqualityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        CiphertextCiphertextEqualityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CiphertextCiphertextEqualityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ciphertextciphertextequalityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a ciphertext-ciphertext equality proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {CiphertextCiphertextEqualityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextciphertextequalityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CiphertextCiphertextEqualityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the ciphertext-ciphertext equality proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextciphertextequalityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const CiphertextCiphertextEqualityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ciphertextciphertextequalityproofdata_free(ptr >>> 0, 1));
/**
 * A ciphertext-ciphertext equality proof. This proof certifies that two ElGamal
 * ciphertexts encrypt the same message.
 */
export class CiphertextCiphertextEqualityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CiphertextCiphertextEqualityProofData.prototype);
        obj.__wbg_ptr = ptr;
        CiphertextCiphertextEqualityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CiphertextCiphertextEqualityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ciphertextciphertextequalityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a ciphertext-ciphertext equality proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {CiphertextCiphertextEqualityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextciphertextequalityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CiphertextCiphertextEqualityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new ciphertext-ciphertext equality proof.
     * @param {ElGamalKeypair} first_keypair
     * @param {ElGamalPubkey} second_pubkey
     * @param {ElGamalCiphertext} first_ciphertext
     * @param {ElGamalCiphertext} second_ciphertext
     * @param {PedersenOpening} second_opening
     * @param {bigint} amount
     */
    constructor(first_keypair, second_pubkey, first_ciphertext, second_ciphertext, second_opening, amount) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(first_keypair, ElGamalKeypair);
            _assertClass(second_pubkey, ElGamalPubkey);
            _assertClass(first_ciphertext, ElGamalCiphertext);
            _assertClass(second_ciphertext, ElGamalCiphertext);
            _assertClass(second_opening, PedersenOpening);
            wasm.ciphertextciphertextequalityproofdata_new(retptr, first_keypair.__wbg_ptr, second_pubkey.__wbg_ptr, first_ciphertext.__wbg_ptr, second_ciphertext.__wbg_ptr, second_opening.__wbg_ptr, amount);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            CiphertextCiphertextEqualityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the ciphertext-ciphertext equality proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextciphertextequalityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {CiphertextCiphertextEqualityProofContext}
     */
    context() {
        const ret = wasm.ciphertextciphertextequalityproofdata_context(this.__wbg_ptr);
        return CiphertextCiphertextEqualityProofContext.__wrap(ret);
    }
    /**
     * Serializes the ciphertext-ciphertext equality proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextciphertextequalityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const CiphertextCommitmentEqualityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ciphertextcommitmentequalityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a ciphertext-commitment equality proof.
 */
export class CiphertextCommitmentEqualityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CiphertextCommitmentEqualityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        CiphertextCommitmentEqualityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CiphertextCommitmentEqualityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ciphertextcommitmentequalityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a ciphertext-commitment equality proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {CiphertextCommitmentEqualityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextcommitmentequalityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CiphertextCommitmentEqualityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the ciphertext-commitment equality proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextcommitmentequalityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const CiphertextCommitmentEqualityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ciphertextcommitmentequalityproofdata_free(ptr >>> 0, 1));
/**
 * A ciphertext-commitment equality proof. This proof certifies that an ElGamal
 * ciphertext and a Pedersen commitment encrypt/encode the same message.
 */
export class CiphertextCommitmentEqualityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(CiphertextCommitmentEqualityProofData.prototype);
        obj.__wbg_ptr = ptr;
        CiphertextCommitmentEqualityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CiphertextCommitmentEqualityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ciphertextcommitmentequalityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a ciphertext-commitment equality proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {CiphertextCommitmentEqualityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextcommitmentequalityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return CiphertextCommitmentEqualityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new ciphertext-commitment equality proof.
     * @param {ElGamalKeypair} keypair
     * @param {ElGamalCiphertext} ciphertext
     * @param {PedersenCommitment} commitment
     * @param {PedersenOpening} opening
     * @param {bigint} amount
     */
    constructor(keypair, ciphertext, commitment, opening, amount) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(keypair, ElGamalKeypair);
            _assertClass(ciphertext, ElGamalCiphertext);
            _assertClass(commitment, PedersenCommitment);
            _assertClass(opening, PedersenOpening);
            wasm.ciphertextcommitmentequalityproofdata_new(retptr, keypair.__wbg_ptr, ciphertext.__wbg_ptr, commitment.__wbg_ptr, opening.__wbg_ptr, amount);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            CiphertextCommitmentEqualityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the ciphertext-commitment equality proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextcommitmentequalityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {CiphertextCommitmentEqualityProofContext}
     */
    context() {
        const ret = wasm.ciphertextcommitmentequalityproofdata_context(this.__wbg_ptr);
        return CiphertextCommitmentEqualityProofContext.__wrap(ret);
    }
    /**
     * Serializes the ciphertext-commitment equality proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ciphertextcommitmentequalityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ConfidentialKeysFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_confidentialkeys_free(ptr >>> 0, 1));
/**
 * Container returned by the unified confidential-balances key derivation.
 *
 * Both the ElGamal keypair and the AES (`decryptable_available_balance`
 * fast-path) key are derived from a single source of input key material
 * via a shared HKDF-SHA512 chain.
 */
export class ConfidentialKeys {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ConfidentialKeys.prototype);
        obj.__wbg_ptr = ptr;
        ConfidentialKeysFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ConfidentialKeysFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_confidentialkeys_free(ptr, 0);
    }
    /**
     * Derives a `ConfidentialKeys` pair from a 64-byte ed25519 signature
     * over the message returned by `signerMessage`.
     * @param {Uint8Array} signature
     * @returns {ConfidentialKeys}
     */
    static fromSignature(signature) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_fromSignature(retptr, addHeapObject(signature));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ConfidentialKeys.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the standard derivation message: the constant bytes
     * `solana-conf-bal/v1` a Solana wallet signs once to derive its
     * `ConfidentialKeys` pair via `fromSignature`.
     *
     * The derived keys are bound to the signing wallet alone (one ElGamal
     * keypair and one AES key across all of the wallet's mints and token
     * accounts) and match what every other standard client derives for the
     * same wallet.
     *
     * Wallets SHOULD recognize these exact bytes, expose the signature only
     * through a dedicated key-derivation API, and refuse any generic
     * `signMessage` request whose message starts with this prefix: the
     * resulting signature is the input key material for the wallet's
     * confidential-balance decryption keys.
     * @returns {Uint8Array}
     */
    static signerMessage() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_prfInput(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the non-standard, seed-scoped WebAuthn PRF evaluation input:
     * byte-identical to `signerMessageWithSeed`. See `signerMessageWithSeed`
     * for when a seed is appropriate; see `prfInput` for the standard path.
     * @param {Uint8Array} public_seed
     * @returns {Uint8Array}
     */
    static prfInputWithSeed(public_seed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_prfInputWithSeed(retptr, addHeapObject(public_seed));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the canonical `public_seed` for single-signer PDA wallet accounts.
     *
     * The output is `program_id || wallet_pda || mint || token_account`.
     * Pass it to `signerMessageWithSeed` or `prfInputWithSeed` so PDA/passkey
     * wallets use a consistent seed convention across implementations.
     * @param {Uint8Array} program_id
     * @param {Uint8Array} wallet_pda
     * @param {Uint8Array} mint
     * @param {Uint8Array} token_account
     * @returns {Uint8Array}
     */
    static pdaWalletPublicSeed(program_id, wallet_pda, mint, token_account) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_pdaWalletPublicSeed(retptr, addHeapObject(program_id), addHeapObject(wallet_pda), addHeapObject(mint), addHeapObject(token_account));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the non-standard, seed-scoped derivation message:
     * `b"solana-conf-bal/v1" || public_seed`.
     *
     * Use this only for schemes that genuinely need keys scoped more finely
     * than the wallet (single-signer PDA wallets via `pdaWalletPublicSeed`,
     * custom application keying). Keys derived from a non-empty seed will NOT
     * match the standard keys other clients derive for the same wallet; for
     * standard wallet-level keys use `signerMessage`.
     * @param {Uint8Array} public_seed
     * @returns {Uint8Array}
     */
    static signerMessageWithSeed(public_seed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_prfInputWithSeed(retptr, addHeapObject(public_seed));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the AES key component.
     * @returns {AeKey}
     */
    ae() {
        const ret = wasm.confidentialkeys_ae(this.__wbg_ptr);
        return AeKey.__wrap(ret);
    }
    /**
     * Returns the ElGamal keypair component.
     * @returns {ElGamalKeypair}
     */
    elgamal() {
        const ret = wasm.confidentialkeys_elgamal(this.__wbg_ptr);
        return ElGamalKeypair.__wrap(ret);
    }
    /**
     * Derives a `ConfidentialKeys` pair from raw input key material.
     *
     * Use this when the caller already produced 32 or more bytes of IKM
     * via a non-`Signer` path: WebAuthn PRF output, Secure Enclave HMAC
     * output, KMS `GenerateMac` output, HKDF over an Ed25519 seed, or a
     * BIP39 seed.
     * @param {Uint8Array} ikm
     * @returns {ConfidentialKeys}
     */
    static fromIkm(ikm) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_fromIkm(retptr, addHeapObject(ikm));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ConfidentialKeys.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Derives a `ConfidentialKeys` pair from a WebAuthn PRF output (the
     * passkey adapter).
     *
     * A passkey's ECDSA signing is randomized by spec, so signature-based
     * derivation is structurally broken on passkey authenticators. The PRF
     * (`hmac-secret`) extension is deterministic by construction and is the
     * only viable path: evaluate `prf` over the salt returned by `prfInput`,
     * then pass the result here as a `Uint8Array`. The browser exposes
     * `prf.results.first` as a raw `ArrayBuffer`, so wrap it with
     * `new Uint8Array(result)` before calling.
     *
     * Accepts a 32-byte output (single `prf.results.first`) or a 64-byte
     * output (`first || second` concatenated). The all-zero output is rejected
     * as a non-functioning authenticator.
     * @param {Uint8Array} prf_output
     * @returns {ConfidentialKeys}
     */
    static fromPrf(prf_output) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_fromPrf(retptr, addHeapObject(prf_output));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ConfidentialKeys.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the standard WebAuthn PRF evaluation input for `fromPrf`:
     * byte-identical to `signerMessage` (the constant `solana-conf-bal/v1`).
     *
     * Pass it to the authenticator as the `prf.eval.first` salt. The same
     * canonical message is signed in the Ed25519 path and PRF-evaluated in the
     * passkey path, so both adapters derive wallet-level keys by default.
     *
     * Browsers apply the mandatory `SHA-256("WebAuthn PRF" || 0x00 || input)`
     * prefixing before the authenticator, so this message is passed as-is.
     * Non-browser / direct-CTAP `hmac-secret` consumers MUST reproduce that
     * prefixing over this message to derive byte-identical keys.
     * @returns {Uint8Array}
     */
    static prfInput() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.confidentialkeys_prfInput(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const DecryptHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decrypthandle_free(ptr >>> 0, 1));

export class DecryptHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DecryptHandle.prototype);
        obj.__wbg_ptr = ptr;
        DecryptHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DecryptHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_decrypthandle_free(ptr, 0);
    }
    /**
     * Deserializes a decryption handle from a byte slice.
     * Returns `undefined` if the bytes are invalid.
     * @param {Uint8Array} uint8_array
     * @returns {DecryptHandle | undefined}
     */
    static fromBytes(uint8_array) {
        const ret = wasm.decrypthandle_fromBytes(addHeapObject(uint8_array));
        return ret === 0 ? undefined : DecryptHandle.__wrap(ret);
    }
    /**
     * Serializes the decryption handle to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.decrypthandle_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ElGamalCiphertextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_elgamalciphertext_free(ptr >>> 0, 1));

export class ElGamalCiphertext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ElGamalCiphertext.prototype);
        obj.__wbg_ptr = ptr;
        ElGamalCiphertextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ElGamalCiphertextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_elgamalciphertext_free(ptr, 0);
    }
    /**
     * Returns the commitment component of the ciphertext.
     * @returns {PedersenCommitment}
     */
    commitment() {
        const ret = wasm.elgamalciphertext_commitment(this.__wbg_ptr);
        return PedersenCommitment.__wrap(ret);
    }
    /**
     * Deserializes an ElGamal ciphertext from a byte slice.
     * Returns `undefined` if the bytes are invalid.
     * @param {Uint8Array} uint8_array
     * @returns {ElGamalCiphertext | undefined}
     */
    static fromBytes(uint8_array) {
        const ret = wasm.elgamalciphertext_fromBytes(addHeapObject(uint8_array));
        return ret === 0 ? undefined : ElGamalCiphertext.__wrap(ret);
    }
    /**
     * Returns the decryption handle component of the ciphertext.
     * @returns {DecryptHandle}
     */
    handle() {
        const ret = wasm.elgamalciphertext_handle(this.__wbg_ptr);
        return DecryptHandle.__wrap(ret);
    }
    /**
     * Serializes the ElGamal ciphertext to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalciphertext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ElGamalKeypairFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_elgamalkeypair_free(ptr >>> 0, 1));

export class ElGamalKeypair {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ElGamalKeypair.prototype);
        obj.__wbg_ptr = ptr;
        ElGamalKeypairFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ElGamalKeypairFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_elgamalkeypair_free(ptr, 0);
    }
    /**
     * Creates an ElGamal keypair from a secret key.
     * @param {ElGamalSecretKey} secret_key
     * @returns {ElGamalKeypair}
     */
    static fromSecretKey(secret_key) {
        _assertClass(secret_key, ElGamalSecretKey);
        const ret = wasm.elgamalkeypair_fromSecretKey(secret_key.__wbg_ptr);
        return ElGamalKeypair.__wrap(ret);
    }
    /**
     * Deterministically derives an `ElGamalKeypair` from a BIP39 mnemonic
     * seed phrase and optional passphrase.
     * @param {string} seed_phrase
     * @param {string | null} [passphrase]
     * @returns {ElGamalKeypair}
     */
    static fromSeedPhraseAndPassphrase(seed_phrase, passphrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(seed_phrase, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(passphrase) ? 0 : passStringToWasm0(passphrase, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
            var len1 = WASM_VECTOR_LEN;
            wasm.elgamalkeypair_fromSeedPhraseAndPassphrase(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ElGamalKeypair.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the public key of the keypair.
     * @returns {ElGamalPubkey}
     */
    pubkey() {
        const ret = wasm.elgamalciphertext_commitment(this.__wbg_ptr);
        return ElGamalPubkey.__wrap(ret);
    }
    /**
     * Returns the secret key of the keypair.
     * @returns {ElGamalSecretKey}
     */
    secret() {
        const ret = wasm.elgamalkeypair_secret(this.__wbg_ptr);
        return ElGamalSecretKey.__wrap(ret);
    }
    /**
     * Creates a new, random ElGamal keypair.
     */
    constructor() {
        const ret = wasm.elgamalkeypair_new_rand();
        this.__wbg_ptr = ret >>> 0;
        ElGamalKeypairFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Deterministically derives an `ElGamalKeypair` from a seed.
     *
     * The seed must be between 32 and 65535 bytes in length.
     * @param {Uint8Array} seed
     * @returns {ElGamalKeypair}
     */
    static fromSeed(seed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalkeypair_fromSeed(retptr, addHeapObject(seed));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ElGamalKeypair.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ElGamalPubkeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_elgamalpubkey_free(ptr >>> 0, 1));

export class ElGamalPubkey {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ElGamalPubkey.prototype);
        obj.__wbg_ptr = ptr;
        ElGamalPubkeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ElGamalPubkeyFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_elgamalpubkey_free(ptr, 0);
    }
    /**
     * Deserializes an ElGamal public key from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} uint8_array
     * @returns {ElGamalPubkey}
     */
    static fromBytes(uint8_array) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalpubkey_fromBytes(retptr, addHeapObject(uint8_array));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ElGamalPubkey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Encrypts a 64-bit amount using the public key.
     * @param {bigint} amount
     * @returns {ElGamalCiphertext}
     */
    encryptU64(amount) {
        const ret = wasm.elgamalpubkey_encryptU64(this.__wbg_ptr, amount);
        return ElGamalCiphertext.__wrap(ret);
    }
    /**
     * Encrypts a 64-bit amount using the public key and a specific opening.
     * @param {bigint} amount
     * @param {PedersenOpening} opening
     * @returns {ElGamalCiphertext}
     */
    encryptWith(amount, opening) {
        _assertClass(opening, PedersenOpening);
        const ret = wasm.elgamalpubkey_encryptWith(this.__wbg_ptr, amount, opening.__wbg_ptr);
        return ElGamalCiphertext.__wrap(ret);
    }
    /**
     * Creates an ElGamal public key from a secret key.
     * @param {ElGamalSecretKey} secret_key
     * @returns {ElGamalPubkey}
     */
    static fromSecretKey(secret_key) {
        _assertClass(secret_key, ElGamalSecretKey);
        const ret = wasm.elgamalpubkey_fromSecretKey(secret_key.__wbg_ptr);
        return ElGamalPubkey.__wrap(ret);
    }
    /**
     * Serializes the ElGamal public key to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalpubkey_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ElGamalSecretKeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_elgamalsecretkey_free(ptr >>> 0, 1));

export class ElGamalSecretKey {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ElGamalSecretKey.prototype);
        obj.__wbg_ptr = ptr;
        ElGamalSecretKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ElGamalSecretKeyFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_elgamalsecretkey_free(ptr, 0);
    }
    /**
     * Deserializes an ElGamal secret key from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} uint8_array
     * @returns {ElGamalSecretKey}
     */
    static fromBytes(uint8_array) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalsecretkey_fromBytes(retptr, addHeapObject(uint8_array));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ElGamalSecretKey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Deterministically derives an `ElGamalSecretKey` from a BIP39 mnemonic
     * seed phrase and optional passphrase.
     * @param {string} seed_phrase
     * @param {string | null} [passphrase]
     * @returns {ElGamalSecretKey}
     */
    static fromSeedPhraseAndPassphrase(seed_phrase, passphrase) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(seed_phrase, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(passphrase) ? 0 : passStringToWasm0(passphrase, wasm.__wbindgen_export_2, wasm.__wbindgen_export_3);
            var len1 = WASM_VECTOR_LEN;
            wasm.elgamalsecretkey_fromSeedPhraseAndPassphrase(retptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ElGamalSecretKey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Decrypts an ElGamal ciphertext.
     * Returns the decrypted amount as a `u64`, or `undefined` if decryption fails.
     * @param {ElGamalCiphertext} ciphertext
     * @returns {bigint}
     */
    decrypt(ciphertext) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(ciphertext, ElGamalCiphertext);
            wasm.elgamalsecretkey_decrypt(retptr, this.__wbg_ptr, ciphertext.__wbg_ptr);
            var r0 = getDataViewMemory0().getBigInt64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return BigInt.asUintN(64, r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Creates a new, random ElGamal secret key.
     */
    constructor() {
        const ret = wasm.elgamalsecretkey_new_rand();
        this.__wbg_ptr = ret >>> 0;
        ElGamalSecretKeyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Serializes the ElGamal secret key to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalsecretkey_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Deterministically derives an `ElGamalSecretKey` from a seed.
     *
     * The seed must be between 32 and 65535 bytes in length.
     * @param {Uint8Array} seed
     * @returns {ElGamalSecretKey}
     */
    static fromSeed(seed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.elgamalsecretkey_fromSeed(retptr, addHeapObject(seed));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ElGamalSecretKey.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const GroupedCiphertext2HandlesValidityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_groupedciphertext2handlesvalidityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a grouped ciphertext 2-handles validity proof.
 */
export class GroupedCiphertext2HandlesValidityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GroupedCiphertext2HandlesValidityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        GroupedCiphertext2HandlesValidityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GroupedCiphertext2HandlesValidityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_groupedciphertext2handlesvalidityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a grouped ciphertext 2-handles validity proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {GroupedCiphertext2HandlesValidityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext2handlesvalidityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return GroupedCiphertext2HandlesValidityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the grouped ciphertext 2-handles validity proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext2handlesvalidityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const GroupedCiphertext2HandlesValidityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_groupedciphertext2handlesvalidityproofdata_free(ptr >>> 0, 1));
/**
 * A grouped ciphertext validity proof with two decryption handles. This proof certifies
 * that a given grouped ElGamal ciphertext with two handles is well-formed.
 */
export class GroupedCiphertext2HandlesValidityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GroupedCiphertext2HandlesValidityProofData.prototype);
        obj.__wbg_ptr = ptr;
        GroupedCiphertext2HandlesValidityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GroupedCiphertext2HandlesValidityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_groupedciphertext2handlesvalidityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a grouped ciphertext validity proof with two handles from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {GroupedCiphertext2HandlesValidityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext2handlesvalidityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return GroupedCiphertext2HandlesValidityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new grouped ciphertext validity proof with two handles.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {GroupedElGamalCiphertext2Handles} grouped_ciphertext
     * @param {bigint} amount
     * @param {PedersenOpening} opening
     */
    constructor(first_pubkey, second_pubkey, grouped_ciphertext, amount, opening) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(first_pubkey, ElGamalPubkey);
            _assertClass(second_pubkey, ElGamalPubkey);
            _assertClass(grouped_ciphertext, GroupedElGamalCiphertext2Handles);
            _assertClass(opening, PedersenOpening);
            wasm.groupedciphertext2handlesvalidityproofdata_new(retptr, first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, grouped_ciphertext.__wbg_ptr, amount, opening.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            GroupedCiphertext2HandlesValidityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the grouped ciphertext 2-handles validity proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext2handlesvalidityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {GroupedCiphertext2HandlesValidityProofContext}
     */
    context() {
        const ret = wasm.groupedciphertext2handlesvalidityproofdata_context(this.__wbg_ptr);
        return GroupedCiphertext2HandlesValidityProofContext.__wrap(ret);
    }
    /**
     * Serializes the grouped ciphertext validity proof with two handles to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext2handlesvalidityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const GroupedCiphertext3HandlesValidityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_groupedciphertext3handlesvalidityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a grouped ciphertext 3-handles validity proof.
 */
export class GroupedCiphertext3HandlesValidityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GroupedCiphertext3HandlesValidityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        GroupedCiphertext3HandlesValidityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GroupedCiphertext3HandlesValidityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_groupedciphertext3handlesvalidityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a grouped ciphertext 3-handles validity proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {GroupedCiphertext3HandlesValidityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext3handlesvalidityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return GroupedCiphertext3HandlesValidityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the grouped ciphertext 3-handles validity proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext3handlesvalidityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const GroupedCiphertext3HandlesValidityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_groupedciphertext3handlesvalidityproofdata_free(ptr >>> 0, 1));
/**
 * A grouped ciphertext validity proof with three decryption handles. This proof certifies
 * that a given grouped ElGamal ciphertext with three handles is well-formed.
 */
export class GroupedCiphertext3HandlesValidityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GroupedCiphertext3HandlesValidityProofData.prototype);
        obj.__wbg_ptr = ptr;
        GroupedCiphertext3HandlesValidityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GroupedCiphertext3HandlesValidityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_groupedciphertext3handlesvalidityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a grouped ciphertext validity proof with three handles from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {GroupedCiphertext3HandlesValidityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext3handlesvalidityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return GroupedCiphertext3HandlesValidityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new grouped ciphertext validity proof with three handles.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {ElGamalPubkey} third_pubkey
     * @param {GroupedElGamalCiphertext3Handles} grouped_ciphertext
     * @param {bigint} amount
     * @param {PedersenOpening} opening
     */
    constructor(first_pubkey, second_pubkey, third_pubkey, grouped_ciphertext, amount, opening) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(first_pubkey, ElGamalPubkey);
            _assertClass(second_pubkey, ElGamalPubkey);
            _assertClass(third_pubkey, ElGamalPubkey);
            _assertClass(grouped_ciphertext, GroupedElGamalCiphertext3Handles);
            _assertClass(opening, PedersenOpening);
            wasm.groupedciphertext3handlesvalidityproofdata_new(retptr, first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, third_pubkey.__wbg_ptr, grouped_ciphertext.__wbg_ptr, amount, opening.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            GroupedCiphertext3HandlesValidityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the grouped ciphertext 3-handles validity proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext3handlesvalidityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {GroupedCiphertext3HandlesValidityProofContext}
     */
    context() {
        const ret = wasm.groupedciphertext3handlesvalidityproofdata_context(this.__wbg_ptr);
        return GroupedCiphertext3HandlesValidityProofContext.__wrap(ret);
    }
    /**
     * Serializes the grouped ciphertext validity proof with three handles to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedciphertext3handlesvalidityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const GroupedElGamalCiphertext2HandlesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_groupedelgamalciphertext2handles_free(ptr >>> 0, 1));

export class GroupedElGamalCiphertext2Handles {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GroupedElGamalCiphertext2Handles.prototype);
        obj.__wbg_ptr = ptr;
        GroupedElGamalCiphertext2HandlesFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GroupedElGamalCiphertext2HandlesFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_groupedelgamalciphertext2handles_free(ptr, 0);
    }
    /**
     * Deserializes a 2-handle grouped ElGamal ciphertext from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {GroupedElGamalCiphertext2Handles}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedelgamalciphertext2handles_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return GroupedElGamalCiphertext2Handles.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Encrypts a 64-bit amount under two ElGamal public keys using a specific opening.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {bigint} amount
     * @param {PedersenOpening} opening
     * @returns {GroupedElGamalCiphertext2Handles}
     */
    static encryptWith(first_pubkey, second_pubkey, amount, opening) {
        _assertClass(first_pubkey, ElGamalPubkey);
        _assertClass(second_pubkey, ElGamalPubkey);
        _assertClass(opening, PedersenOpening);
        const ret = wasm.groupedelgamalciphertext2handles_encryptWith(first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, amount, opening.__wbg_ptr);
        return GroupedElGamalCiphertext2Handles.__wrap(ret);
    }
    /**
     * Decrypts the ciphertext using a secret key and a handle index.
     * Returns the decrypted amount as a `u64`, or `undefined` if decryption fails.
     * @param {ElGamalSecretKey} secret_key
     * @param {number} index
     * @returns {bigint}
     */
    decrypt(secret_key, index) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(secret_key, ElGamalSecretKey);
            wasm.groupedelgamalciphertext2handles_decrypt(retptr, this.__wbg_ptr, secret_key.__wbg_ptr, index);
            var r0 = getDataViewMemory0().getBigInt64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return BigInt.asUintN(64, r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Encrypts a 64-bit amount under two ElGamal public keys.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {bigint} amount
     * @returns {GroupedElGamalCiphertext2Handles}
     */
    static encrypt(first_pubkey, second_pubkey, amount) {
        _assertClass(first_pubkey, ElGamalPubkey);
        _assertClass(second_pubkey, ElGamalPubkey);
        const ret = wasm.groupedelgamalciphertext2handles_encrypt(first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, amount);
        return GroupedElGamalCiphertext2Handles.__wrap(ret);
    }
    /**
     * Serializes the 2-handle grouped ElGamal ciphertext to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedelgamalciphertext2handles_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const GroupedElGamalCiphertext3HandlesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_groupedelgamalciphertext3handles_free(ptr >>> 0, 1));

export class GroupedElGamalCiphertext3Handles {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(GroupedElGamalCiphertext3Handles.prototype);
        obj.__wbg_ptr = ptr;
        GroupedElGamalCiphertext3HandlesFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GroupedElGamalCiphertext3HandlesFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_groupedelgamalciphertext3handles_free(ptr, 0);
    }
    /**
     * Deserializes a 3-handle grouped ElGamal ciphertext from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {GroupedElGamalCiphertext3Handles}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedelgamalciphertext3handles_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return GroupedElGamalCiphertext3Handles.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Encrypts a 64-bit amount under three ElGamal public keys using a specific opening.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {ElGamalPubkey} third_pubkey
     * @param {bigint} amount
     * @param {PedersenOpening} opening
     * @returns {GroupedElGamalCiphertext3Handles}
     */
    static encryptWith(first_pubkey, second_pubkey, third_pubkey, amount, opening) {
        _assertClass(first_pubkey, ElGamalPubkey);
        _assertClass(second_pubkey, ElGamalPubkey);
        _assertClass(third_pubkey, ElGamalPubkey);
        _assertClass(opening, PedersenOpening);
        const ret = wasm.groupedelgamalciphertext3handles_encryptWith(first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, third_pubkey.__wbg_ptr, amount, opening.__wbg_ptr);
        return GroupedElGamalCiphertext3Handles.__wrap(ret);
    }
    /**
     * Decrypts the ciphertext using a secret key and a handle index.
     * Returns the decrypted amount as a `u64`, or `undefined` if decryption fails.
     * @param {ElGamalSecretKey} secret_key
     * @param {number} index
     * @returns {bigint}
     */
    decrypt(secret_key, index) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(secret_key, ElGamalSecretKey);
            wasm.groupedelgamalciphertext3handles_decrypt(retptr, this.__wbg_ptr, secret_key.__wbg_ptr, index);
            var r0 = getDataViewMemory0().getBigInt64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return BigInt.asUintN(64, r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Encrypts a 64-bit amount under three ElGamal public keys.
     * @param {ElGamalPubkey} first_pubkey
     * @param {ElGamalPubkey} second_pubkey
     * @param {ElGamalPubkey} third_pubkey
     * @param {bigint} amount
     * @returns {GroupedElGamalCiphertext3Handles}
     */
    static encrypt(first_pubkey, second_pubkey, third_pubkey, amount) {
        _assertClass(first_pubkey, ElGamalPubkey);
        _assertClass(second_pubkey, ElGamalPubkey);
        _assertClass(third_pubkey, ElGamalPubkey);
        const ret = wasm.groupedelgamalciphertext3handles_encrypt(first_pubkey.__wbg_ptr, second_pubkey.__wbg_ptr, third_pubkey.__wbg_ptr, amount);
        return GroupedElGamalCiphertext3Handles.__wrap(ret);
    }
    /**
     * Serializes the 3-handle grouped ElGamal ciphertext to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.groupedelgamalciphertext3handles_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const PedersenCommitmentFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pedersencommitment_free(ptr >>> 0, 1));

export class PedersenCommitment {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PedersenCommitment.prototype);
        obj.__wbg_ptr = ptr;
        PedersenCommitmentFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof PedersenCommitment)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PedersenCommitmentFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pedersencommitment_free(ptr, 0);
    }
    /**
     * Deserializes a Pedersen commitment from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} uint8_array
     * @returns {PedersenCommitment}
     */
    static fromBytes(uint8_array) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pedersencommitment_fromBytes(retptr, addHeapObject(uint8_array));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PedersenCommitment.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Combines low and high Pedersen commitments as `lo + hi * 2^bit_length`.
     * @param {PedersenCommitment} lo
     * @param {PedersenCommitment} hi
     * @param {number} bit_length
     * @returns {PedersenCommitment}
     */
    static combineLoHi(lo, hi, bit_length) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(lo, PedersenCommitment);
            _assertClass(hi, PedersenCommitment);
            wasm.pedersencommitment_combineLoHi(retptr, lo.__wbg_ptr, hi.__wbg_ptr, bit_length);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PedersenCommitment.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Multiplies a Pedersen commitment by a 64-bit scalar.
     * @param {bigint} scalar
     * @returns {PedersenCommitment}
     */
    multiplyByU64(scalar) {
        const ret = wasm.pedersencommitment_multiplyByU64(this.__wbg_ptr, scalar);
        return PedersenCommitment.__wrap(ret);
    }
    /**
     * Adds two Pedersen commitments.
     * @param {PedersenCommitment} other
     * @returns {PedersenCommitment}
     */
    add(other) {
        _assertClass(other, PedersenCommitment);
        const ret = wasm.pedersencommitment_add(this.__wbg_ptr, other.__wbg_ptr);
        return PedersenCommitment.__wrap(ret);
    }
    /**
     * Creates the identity Pedersen commitment.
     * @returns {PedersenCommitment}
     */
    static zero() {
        const ret = wasm.pedersencommitment_zero();
        return PedersenCommitment.__wrap(ret);
    }
    /**
     * Subtracts another Pedersen commitment from this commitment.
     * @param {PedersenCommitment} other
     * @returns {PedersenCommitment}
     */
    subtract(other) {
        _assertClass(other, PedersenCommitment);
        const ret = wasm.pedersencommitment_subtract(this.__wbg_ptr, other.__wbg_ptr);
        return PedersenCommitment.__wrap(ret);
    }
    /**
     * Serializes the Pedersen commitment to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pedersencommitment_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Creates a Pedersen commitment from a 64-bit amount and a Pedersen opening.
     * @param {bigint} amount
     * @param {PedersenOpening} opening
     * @returns {PedersenCommitment}
     */
    static from(amount, opening) {
        _assertClass(opening, PedersenOpening);
        const ret = wasm.pedersencommitment_from(amount, opening.__wbg_ptr);
        return PedersenCommitment.__wrap(ret);
    }
}

const PedersenOpeningFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pedersenopening_free(ptr >>> 0, 1));

export class PedersenOpening {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PedersenOpening.prototype);
        obj.__wbg_ptr = ptr;
        PedersenOpeningFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    static __unwrap(jsValue) {
        if (!(jsValue instanceof PedersenOpening)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PedersenOpeningFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pedersenopening_free(ptr, 0);
    }
    /**
     * Combines low and high Pedersen openings as `lo + hi * 2^bit_length`.
     * @param {PedersenOpening} lo
     * @param {PedersenOpening} hi
     * @param {number} bit_length
     * @returns {PedersenOpening}
     */
    static combineLoHi(lo, hi, bit_length) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(lo, PedersenOpening);
            _assertClass(hi, PedersenOpening);
            wasm.pedersenopening_combineLoHi(retptr, lo.__wbg_ptr, hi.__wbg_ptr, bit_length);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PedersenOpening.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Multiplies a Pedersen opening by a 64-bit scalar.
     * @param {bigint} scalar
     * @returns {PedersenOpening}
     */
    multiplyByU64(scalar) {
        const ret = wasm.pedersenopening_multiplyByU64(this.__wbg_ptr, scalar);
        return PedersenOpening.__wrap(ret);
    }
    /**
     * Adds two Pedersen openings.
     * @param {PedersenOpening} other
     * @returns {PedersenOpening}
     */
    add(other) {
        _assertClass(other, PedersenOpening);
        const ret = wasm.pedersenopening_add(this.__wbg_ptr, other.__wbg_ptr);
        return PedersenOpening.__wrap(ret);
    }
    /**
     * Creates a zero Pedersen opening.
     * @returns {PedersenOpening}
     */
    static zero() {
        const ret = wasm.pedersenopening_zero();
        return PedersenOpening.__wrap(ret);
    }
    /**
     * Creates a new, random Pedersen opening.
     */
    constructor() {
        const ret = wasm.pedersenopening_new_rand();
        this.__wbg_ptr = ret >>> 0;
        PedersenOpeningFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Subtracts another Pedersen opening from this opening.
     * @param {PedersenOpening} other
     * @returns {PedersenOpening}
     */
    subtract(other) {
        _assertClass(other, PedersenOpening);
        const ret = wasm.pedersenopening_subtract(this.__wbg_ptr, other.__wbg_ptr);
        return PedersenOpening.__wrap(ret);
    }
}

const PercentageWithCapProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_percentagewithcapproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a percentage-with-cap proof.
 */
export class PercentageWithCapProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PercentageWithCapProofContext.prototype);
        obj.__wbg_ptr = ptr;
        PercentageWithCapProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PercentageWithCapProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_percentagewithcapproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a percentage-with-cap proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {PercentageWithCapProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.percentagewithcapproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PercentageWithCapProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the percentage-with-cap proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.percentagewithcapproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const PercentageWithCapProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_percentagewithcapproofdata_free(ptr >>> 0, 1));
/**
 * A percentage-with-cap proof. This proof is used to certify that a transfer
 * amount is within a certain percentage of a base amount, with a cap.
 */
export class PercentageWithCapProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PercentageWithCapProofData.prototype);
        obj.__wbg_ptr = ptr;
        PercentageWithCapProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PercentageWithCapProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_percentagewithcapproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a percentage-with-cap proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {PercentageWithCapProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.percentagewithcapproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PercentageWithCapProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new percentage-with-cap proof.
     * @param {PedersenCommitment} percentage_commitment
     * @param {PedersenOpening} percentage_opening
     * @param {bigint} percentage_amount
     * @param {PedersenCommitment} delta_commitment
     * @param {PedersenOpening} delta_opening
     * @param {bigint} delta_amount
     * @param {PedersenCommitment} claimed_commitment
     * @param {PedersenOpening} claimed_opening
     * @param {bigint} max_value
     */
    constructor(percentage_commitment, percentage_opening, percentage_amount, delta_commitment, delta_opening, delta_amount, claimed_commitment, claimed_opening, max_value) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(percentage_commitment, PedersenCommitment);
            _assertClass(percentage_opening, PedersenOpening);
            _assertClass(delta_commitment, PedersenCommitment);
            _assertClass(delta_opening, PedersenOpening);
            _assertClass(claimed_commitment, PedersenCommitment);
            _assertClass(claimed_opening, PedersenOpening);
            wasm.percentagewithcapproofdata_new(retptr, percentage_commitment.__wbg_ptr, percentage_opening.__wbg_ptr, percentage_amount, delta_commitment.__wbg_ptr, delta_opening.__wbg_ptr, delta_amount, claimed_commitment.__wbg_ptr, claimed_opening.__wbg_ptr, max_value);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            PercentageWithCapProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the percentage-with-cap proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.percentagewithcapproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {PercentageWithCapProofContext}
     */
    context() {
        const ret = wasm.percentagewithcapproofdata_context(this.__wbg_ptr);
        return PercentageWithCapProofContext.__wrap(ret);
    }
    /**
     * Serializes the percentage-with-cap proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.percentagewithcapproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const PubkeyValidityProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pubkeyvalidityproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a public-key validity proof.
 */
export class PubkeyValidityProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PubkeyValidityProofContext.prototype);
        obj.__wbg_ptr = ptr;
        PubkeyValidityProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PubkeyValidityProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pubkeyvalidityproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a public-key validity proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {PubkeyValidityProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pubkeyvalidityproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PubkeyValidityProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the public-key validity proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pubkeyvalidityproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const PubkeyValidityProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pubkeyvalidityproofdata_free(ptr >>> 0, 1));
/**
 * A public-key validity proof. This proof is used to certify that an ElGamal
 * public key is valid (i.e., the prover knows the corresponding secret key).
 */
export class PubkeyValidityProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PubkeyValidityProofData.prototype);
        obj.__wbg_ptr = ptr;
        PubkeyValidityProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PubkeyValidityProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pubkeyvalidityproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a pubkey validity proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {PubkeyValidityProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pubkeyvalidityproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PubkeyValidityProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new public-key validity proof.
     * @param {ElGamalKeypair} keypair
     */
    constructor(keypair) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(keypair, ElGamalKeypair);
            wasm.pubkeyvalidityproofdata_new(retptr, keypair.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            PubkeyValidityProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the public-key validity proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pubkeyvalidityproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {PubkeyValidityProofContext}
     */
    context() {
        const ret = wasm.pubkeyvalidityproofdata_context(this.__wbg_ptr);
        return PubkeyValidityProofContext.__wrap(ret);
    }
    /**
     * Serializes the pubkey validity proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.pubkeyvalidityproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ZeroCiphertextProofContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_zerociphertextproofcontext_free(ptr >>> 0, 1));
/**
 * The context data needed to verify a zero-ciphertext proof.
 */
export class ZeroCiphertextProofContext {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ZeroCiphertextProofContext.prototype);
        obj.__wbg_ptr = ptr;
        ZeroCiphertextProofContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ZeroCiphertextProofContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_zerociphertextproofcontext_free(ptr, 0);
    }
    /**
     * Deserializes a zero-ciphertext proof context from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {ZeroCiphertextProofContext}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.zerociphertextproofcontext_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ZeroCiphertextProofContext.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Serializes the zero-ciphertext proof context to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.zerociphertextproofcontext_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

const ZeroCiphertextProofDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_zerociphertextproofdata_free(ptr >>> 0, 1));
/**
 * A zero-ciphertext proof. This proof is used to certify that an ElGamal
 * ciphertext encrypts the number 0.
 */
export class ZeroCiphertextProofData {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ZeroCiphertextProofData.prototype);
        obj.__wbg_ptr = ptr;
        ZeroCiphertextProofDataFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ZeroCiphertextProofDataFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_zerociphertextproofdata_free(ptr, 0);
    }
    /**
     * Deserializes a zero-ciphertext proof from a byte slice.
     * Throws an error if the bytes are invalid.
     * @param {Uint8Array} bytes
     * @returns {ZeroCiphertextProofData}
     */
    static fromBytes(bytes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.zerociphertextproofdata_fromBytes(retptr, addBorrowedObject(bytes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return ZeroCiphertextProofData.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    /**
     * Creates a new zero-ciphertext proof.
     * @param {ElGamalKeypair} keypair
     * @param {ElGamalCiphertext} ciphertext
     */
    constructor(keypair, ciphertext) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertClass(keypair, ElGamalKeypair);
            _assertClass(ciphertext, ElGamalCiphertext);
            wasm.zerociphertextproofdata_new(retptr, keypair.__wbg_ptr, ciphertext.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            ZeroCiphertextProofDataFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Verifies the zero-ciphertext proof.
     * Throws an error if the proof is invalid.
     */
    verify() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.zerociphertextproofdata_verify(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Returns the context data associated with the proof.
     * @returns {ZeroCiphertextProofContext}
     */
    context() {
        const ret = wasm.zerociphertextproofdata_context(this.__wbg_ptr);
        return ZeroCiphertextProofContext.__wrap(ret);
    }
    /**
     * Serializes the zero-ciphertext proof to a byte array.
     * @returns {Uint8Array}
     */
    toBytes() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.zerociphertextproofdata_toBytes(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_1(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_call_672a4d21634d4a24 = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).call(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_crypto_86f2631e91b51511 = function(arg0) {
        const ret = getObject(arg0).crypto;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getRandomValues_b3f15fcbfabb0f8b = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).getRandomValues(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_length_65df9cd7c58180b2 = function(arg0) {
        const ret = getObject(arg0).length;
        return ret;
    };
    imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
        const ret = getObject(arg0).length;
        return ret;
    };
    imports.wbg.__wbg_msCrypto_d562bbe83e0d4b91 = function(arg0) {
        const ret = getObject(arg0).msCrypto;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
        const ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_new_e5efeb1e59f0eb60 = function(arg0) {
        const ret = new BigUint64Array(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function(arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_node_e1f24f89a7336c2e = function(arg0) {
        const ret = getObject(arg0).node;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_pedersencommitment_unwrap = function(arg0) {
        const ret = PedersenCommitment.__unwrap(takeObject(arg0));
        return ret;
    };
    imports.wbg.__wbg_pedersenopening_unwrap = function(arg0) {
        const ret = PedersenOpening.__unwrap(takeObject(arg0));
        return ret;
    };
    imports.wbg.__wbg_process_3975fd6c72f520aa = function(arg0) {
        const ret = getObject(arg0).process;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_randomFillSync_f8c153b79f285817 = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).randomFillSync(takeObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_require_b74f47fc2d022fd6 = function() { return handleError(function () {
        const ret = module.require;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_set_5882e5672c74f0b1 = function(arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };
    imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) {
        const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_versions_4e31226f5e8dc909 = function(arg0) {
        const ret = getObject(arg0).versions;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_is_function = function(arg0) {
        const ret = typeof(getObject(arg0)) === 'function';
        return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = getObject(arg0);
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(getObject(arg0)) === 'string';
        return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        const ret = getObject(arg0) === undefined;
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;



    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('index_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
