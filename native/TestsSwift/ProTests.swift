import XCTest
@testable import LocalAIBench
final class ProTests: XCTestCase {
    let key="38b1460a-5104-4067-a91d-77b872934d51"
    let instance="f90ec370-fd83-46a5-8bbd-44a241e78665"
    let cfg=LemonConfiguration(storeId:1,productId:2,variantId:3,purchaseURL:"",priceLabel:"HK$180")
    func fixture() -> [String:Any] { ["valid":true,"error":NSNull(),"license_key":["key":key,"status":"active","expires_at":NSNull()],"instance":["id":instance],"meta":["store_id":1,"product_id":2,"variant_id":3]] }
    func testLemonRejectsOtherProductsExpiredAndOtherInstances() throws {
        func valid(_ r:[String:Any]) throws -> Bool { LemonValidation.valid(try JSONSerialization.data(withJSONObject:r),configuration:cfg,key:key,instanceID:instance) }
        XCTAssertTrue(try valid(fixture()))
        for field in ["store_id","product_id","variant_id"] {var r=fixture();var m=r["meta"] as! [String:Any];m[field]=99;r["meta"]=m;XCTAssertFalse(try valid(r))}
        for state in ["disabled","expired","inactive"] {var r=fixture();var k=r["license_key"] as! [String:Any];k["status"]=state;r["license_key"]=k;XCTAssertFalse(try valid(r))}
        var r=fixture();r["instance"]=["id":UUID().uuidString];XCTAssertFalse(try valid(r))
        r=fixture();var k=r["license_key"] as! [String:Any];k["expires_at"]="2027-01-01T00:00:00Z";r["license_key"]=k;XCTAssertFalse(try valid(r))
    }
    func testActivationNeedsReturnedInstanceAndPreflightAllowsInactive() throws {
        var r=fixture();r.removeValue(forKey:"valid");r["activated"]=true
        XCTAssertTrue(LemonValidation.valid(try JSONSerialization.data(withJSONObject:r),configuration:cfg,key:key,activating:true))
        r["instance"]=NSNull();XCTAssertFalse(LemonValidation.valid(try JSONSerialization.data(withJSONObject:r),configuration:cfg,key:key,activating:true))
        r=fixture();r["license_key"]=["key":key,"status":"inactive","expires_at":NSNull()];r["instance"]=NSNull()
        XCTAssertTrue(LemonValidation.valid(try JSONSerialization.data(withJSONObject:r),configuration:cfg,key:key,preactivation:true))
    }
    func testLicenseKeyFormEncodingDoesNotInjectFields() {
        let body=String(data:LemonValidation.body(["license_key":"a&instance_id=other+","instance_id":"expected"]),encoding:.utf8)!
        XCTAssertTrue(body.contains("license_key=a%26instance_id%3Dother%2B"));XCTAssertTrue(body.contains("instance_id=expected"))
    }
    @MainActor func testFreeCannotSelectFourJobsAndTrialRemainsSeparate() {
        let b=BenchController();b.models=[URL(fileURLWithPath:"/tmp/model.gguf")]
        for n in 1...3{b.concurrentJobs=n;XCTAssertTrue(b.validSelection)}
        b.concurrentJobs=4;XCTAssertFalse(b.validSelection)
        b.concurrentMode=false;b.trial=true;XCTAssertTrue(b.validSelection)
    }
}
