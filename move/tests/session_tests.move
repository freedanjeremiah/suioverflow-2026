#[test_only]
module mycelia::session_tests;

use mycelia::session::{Self, Session, SessionCap};
use sui::test_scenario as ts;

const OWNER: address = @0xA;
const BOB: address = @0xB;

fun valid_id(sess: &Session, suffix: vector<u8>): vector<u8> {
    let mut id = object::id(sess).to_bytes(); // 32-byte session prefix
    id.append(suffix);
    id
}

#[test]
fun create_makes_owner_sole_member() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    let sess = sc.take_shared<Session>();
    let cap = sc.take_from_sender<SessionCap>();
    assert!(session::is_member(&sess, OWNER), 0);
    assert!(session::member_count(&sess) == 1, 1);
    assert!(session::head_version(&sess) == 0, 2);
    ts::return_shared(sess);
    sc.return_to_sender(cap);
    sc.end();
}

#[test]
fun add_then_remove_member_is_forward_only() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    {
        let mut sess = sc.take_shared<Session>();
        let cap = sc.take_from_sender<SessionCap>();
        session::add_member(&cap, &mut sess, BOB);
        assert!(session::is_member(&sess, BOB), 0);
        assert!(session::member_count(&sess) == 2, 1);
        session::remove_member(&cap, &mut sess, BOB);
        assert!(!session::is_member(&sess, BOB), 2);
        ts::return_shared(sess);
        sc.return_to_sender(cap);
    };
    sc.end();
}

#[test]
fun share_and_unshare_node() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    {
        let mut sess = sc.take_shared<Session>();
        let cap = sc.take_from_sender<SessionCap>();
        let id = valid_id(&sess, b"nodehash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        session::share_node(&mut sess, id, sc.ctx());
        assert!(session::is_shared(&sess, id), 0);
        session::unshare_node(&cap, &mut sess, id);
        assert!(!session::is_shared(&sess, id), 1);
        ts::return_shared(sess);
        sc.return_to_sender(cap);
    };
    sc.end();
}

#[test]
fun set_head_advances_version() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    {
        let mut sess = sc.take_shared<Session>();
        let cap = sc.take_from_sender<SessionCap>();
        session::set_head(&mut sess, b"blobA".to_string(), 1, sc.ctx());
        assert!(session::head_version(&sess) == 1, 0);
        session::set_head(&mut sess, b"blobB".to_string(), 2, sc.ctx());
        assert!(session::head_version(&sess) == 2, 1);
        ts::return_shared(sess);
        sc.return_to_sender(cap);
    };
    sc.end();
}

#[test]
fun renew_updates_end_epoch() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    {
        let mut sess = sc.take_shared<Session>();
        let cap = sc.take_from_sender<SessionCap>();
        assert!(session::end_epoch(&sess) == 100, 0);
        session::renew(&cap, &mut sess, 205);
        assert!(session::end_epoch(&sess) == 205, 1);
        ts::return_shared(sess);
        sc.return_to_sender(cap);
    };
    sc.end();
}

#[test]
#[expected_failure(abort_code = 4)] // EStaleVersion — single mutable monotonic head
fun set_head_rejects_stale_version() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    {
        let mut sess = sc.take_shared<Session>();
        let cap = sc.take_from_sender<SessionCap>();
        session::set_head(&mut sess, b"blobA".to_string(), 1, sc.ctx());
        session::set_head(&mut sess, b"blobB".to_string(), 1, sc.ctx()); // not > 1 -> abort
        ts::return_shared(sess);
        sc.return_to_sender(cap);
    };
    sc.end();
}

#[test]
#[expected_failure(abort_code = 3)] // EBadId — id must carry the session prefix
fun share_rejects_bad_prefix() {
    let mut sc = ts::begin(OWNER);
    session::create_session(b"team".to_string(), 100, sc.ctx());
    sc.next_tx(OWNER);
    {
        let mut sess = sc.take_shared<Session>();
        let cap = sc.take_from_sender<SessionCap>();
        session::share_node(&mut sess, b"not-a-valid-prefixed-id", sc.ctx());
        ts::return_shared(sess);
        sc.return_to_sender(cap);
    };
    sc.end();
}
