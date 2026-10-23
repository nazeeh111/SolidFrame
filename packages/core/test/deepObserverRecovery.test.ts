// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { DeepObserver, Material, Observable, PhongMaterial, Texture } from "../src";
import { TestDocument } from "../test-utils";

class Leaf extends Observable {
    get value() {
        return this.getPrivateValue("value", 0);
    }
    set value(value: number) {
        this.setProperty("value", value);
    }
}

class Branch extends Observable {
    private _nested: Leaf | null | undefined = new Leaf();
    private _nestedExtra = new Leaf();

    get nested() {
        return this._nested;
    }
    set nested(value: Leaf | null | undefined) {
        this.setProperty("nested", value);
    }
    get nestedExtra() {
        return this._nestedExtra;
    }
}

describe("DeepObserver subscription recovery", () => {
    test("replacing one shared texture preserves the other material subscription", () => {
        const document = new TestDocument();
        const material = new PhongMaterial({ document, name: "Surface", color: 0xffffff });
        const shared = new Texture({ document });
        const replacement = new Texture({ document });
        material.specularMap = shared;
        material.bumpMap = shared;
        const paths: string[] = [];
        const handler = (path: string) => paths.push(path);
        DeepObserver.addDeepPropertyChangedHandler(material, handler);
        try {
            material.bumpMap = replacement;
            paths.length = 0;
            shared.rotation = 1;
            expect(paths).toEqual(["specularMap.rotation"]);
            replacement.rotation = 2;
            expect(paths).toEqual(["specularMap.rotation", "bumpMap.rotation"]);
        } finally {
            DeepObserver.removeDeepPropertyChangedHandler(material, handler);
            shared.dispose();
            replacement.dispose();
            material.dispose();
            document.dispose();
        }
    });

    test("material texture replacement stops observing the detached texture", () => {
        const document = new TestDocument();
        const material = new Material({ document, name: "Surface", color: 0xffffff });
        const original = material.map;
        const replacement = new Texture({ document });
        const paths: string[] = [];
        const handler = (path: string) => paths.push(path);
        DeepObserver.addDeepPropertyChangedHandler(material, handler);
        try {
            material.map = replacement;
            paths.length = 0;
            original.image = "old.png";
            expect(paths).toEqual([]);
            replacement.image = "current.png";
            expect(paths).toEqual(["map.image"]);
        } finally {
            DeepObserver.removeDeepPropertyChangedHandler(material, handler);
            original.dispose();
            replacement.dispose();
            material.dispose();
            document.dispose();
        }
    });

    test("removing an unknown handler preserves registered handlers", () => {
        const root = new Leaf();
        const calls: number[] = [];
        const first = () => calls.push(1);
        const second = () => calls.push(2);
        DeepObserver.addDeepPropertyChangedHandler(root, first);
        DeepObserver.addDeepPropertyChangedHandler(root, second);
        try {
            DeepObserver.removeDeepPropertyChangedHandler(root, () => {});
            root.value = 1;
            expect(calls).toEqual([1, 2]);
        } finally {
            DeepObserver.removeDeepPropertyChangedHandler(root, first);
            DeepObserver.removeDeepPropertyChangedHandler(root, second);
            root.dispose();
        }
    });

    test("replacing and restoring a child detaches the previous child", () => {
        const root = new Branch();
        const original = root.nested!;
        const replacement = new Leaf();
        const paths: string[] = [];
        const handler = (path: string) => paths.push(path);
        DeepObserver.addDeepPropertyChangedHandler(root, handler);
        try {
            root.nested = replacement;
            paths.length = 0;
            original.value = 1;
            expect(paths).toEqual([]);
            replacement.value = 1;
            expect(paths).toEqual(["nested.value"]);

            root.nested = original;
            paths.length = 0;
            replacement.value = 2;
            expect(paths).toEqual([]);
            original.value = 2;
            expect(paths).toEqual(["nested.value"]);
        } finally {
            DeepObserver.removeDeepPropertyChangedHandler(root, handler);
            original.dispose();
            replacement.dispose();
            root.nestedExtra.dispose();
            root.dispose();
        }
    });

    test.each([undefined, null])("clearing a child to %s preserves similarly named siblings", (empty) => {
        const root = new Branch();
        const original = root.nested!;
        const paths: string[] = [];
        const handler = (path: string) => paths.push(path);
        DeepObserver.addDeepPropertyChangedHandler(root, handler);
        try {
            root.nested = empty;
            paths.length = 0;
            original.value = 1;
            expect(paths).toEqual([]);
            root.nestedExtra.value = 1;
            expect(paths).toEqual(["nestedExtra.value"]);
        } finally {
            DeepObserver.removeDeepPropertyChangedHandler(root, handler);
            original.dispose();
            root.nestedExtra.dispose();
            root.dispose();
        }
    });
});
