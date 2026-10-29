import { ok, fail, respond, respondOk, respondFail } from "../../shared/envelope.js";

describe("envelope", () => {
  it("ok wraps data in the success contract", () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
  });

  it("fail wraps message in the failure contract", () => {
    expect(fail("bad")).toEqual({ success: false, message: "bad" });
    expect(fail("bad", "E_X")).toEqual({ success: false, message: "bad", code: "E_X" });
  });

  it("respond serialises JSON with the content-type header", () => {
    const res = respond(200, ok({ hello: "world" }));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ success: true, data: { hello: "world" } });
  });

  it("respondOk defaults to 200 and respondFail carries the code", () => {
    expect(respondOk([1, 2]).statusCode).toBe(200);
    const res = respondFail(422, "nope", "VALIDATION");
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toEqual({ success: false, message: "nope", code: "VALIDATION" });
  });
});
