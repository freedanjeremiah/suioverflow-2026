/// Mycelia session — the ONLY mutable shared object per session (invariant #2).
/// Coordination layer: members, the per-node share allowlist, the manifest head
/// pointer, and the Seal access gate. MYCELIA_SPEC §7.
module mycelia::session;

use std::string::String;
use sui::event;
use sui::vec_set::{Self, VecSet};

// ---- errors ----
const ENoAccess: u64 = 1; // caller not a member
const ENotShared: u64 = 2; // seal id not in shared_nodes
const EBadId: u64 = 3; // seal id missing this session's prefix
const EStaleVersion: u64 = 4; // head version must strictly increase (single mutable head)
const EWrongSession: u64 = 5; // cap does not match session

/// The shared session object. Exactly one mutable shared object per session.
public struct Session has key {
    id: UID,
    name: String,
    owner: address,
    members: VecSet<address>, // includes owner
    shared_nodes: VecSet<vector<u8>>, // allowed seal identities (64-byte: sessionPrefix++nodeHash)
    head_blob: String, // manifest blob id
    head_version: u64,
    event_blob: String, // latest event-log quilt id
    end_epoch: u64, // storage funded through (Walrus epoch)
    revoked: VecSet<address>, // forward-only audit trail
}

/// Owner capability — gates owner-only ops (member/unshare/renew).
public struct SessionCap has key, store {
    id: UID,
    session: ID,
}

/// Emitted on head change — the fast-notify path (SubscriptionService).
public struct SessionChanged has copy, drop {
    session: ID,
    version: u64,
}
public struct MemberChanged has copy, drop {
    session: ID,
    member: address,
    added: bool,
}

// ---- lifecycle ----

/// Create a session. Shares the Session object and gives the creator a SessionCap.
public entry fun create_session(name: String, end_epoch: u64, ctx: &mut TxContext) {
    let owner = ctx.sender();
    let mut members = vec_set::empty<address>();
    members.insert(owner);
    let session = Session {
        id: object::new(ctx),
        name,
        owner,
        members,
        shared_nodes: vec_set::empty<vector<u8>>(),
        head_blob: b"".to_string(),
        head_version: 0,
        event_blob: b"".to_string(),
        end_epoch,
        revoked: vec_set::empty<address>(),
    };
    let cap = SessionCap { id: object::new(ctx), session: object::id(&session) };
    transfer::transfer(cap, owner);
    transfer::share_object(session);
}

fun assert_cap(cap: &SessionCap, self: &Session) {
    assert!(cap.session == object::id(self), EWrongSession);
}

// ---- membership (owner-gated) ----

public entry fun add_member(cap: &SessionCap, self: &mut Session, who: address) {
    assert_cap(cap, self);
    if (!self.members.contains(&who)) {
        self.members.insert(who);
        if (self.revoked.contains(&who)) { self.revoked.remove(&who); };
        event::emit(MemberChanged { session: object::id(self), member: who, added: true });
    }
}

/// Remove a member. Forward-only: future key issuance is blocked; already
/// decrypted local copies are NOT retracted (invariant #4). Audit in `revoked`.
public entry fun remove_member(cap: &SessionCap, self: &mut Session, who: address) {
    assert_cap(cap, self);
    assert!(who != self.owner, ENoAccess);
    if (self.members.contains(&who)) {
        self.members.remove(&who);
        if (!self.revoked.contains(&who)) { self.revoked.insert(who); };
        event::emit(MemberChanged { session: object::id(self), member: who, added: false });
    }
}

// ---- sharing ----

/// Add a node's seal identity to the allowlist. Any member may contribute.
/// Idempotent. The id must carry this session's prefix.
public entry fun share_node(self: &mut Session, id: vector<u8>, ctx: &TxContext) {
    assert!(self.members.contains(&ctx.sender()), ENoAccess);
    assert!(has_session_prefix(self, &id), EBadId);
    if (!self.shared_nodes.contains(&id)) { self.shared_nodes.insert(id); };
}

/// Un-share a node (owner-gated). Forward-only: blocks future decrypts.
public entry fun unshare_node(cap: &SessionCap, self: &mut Session, id: vector<u8>) {
    assert_cap(cap, self);
    if (self.shared_nodes.contains(&id)) { self.shared_nodes.remove(&id); };
}

// ---- head / events (single-writer monotonic head) ----

/// Update the manifest head. Any member; version MUST strictly increase
/// (enforces the single mutable head, invariant #2).
public entry fun set_head(self: &mut Session, blob: String, version: u64, ctx: &TxContext) {
    assert!(self.members.contains(&ctx.sender()), ENoAccess);
    assert!(version > self.head_version, EStaleVersion);
    self.head_blob = blob;
    self.head_version = version;
    event::emit(SessionChanged { session: object::id(self), version });
}

public fun set_event_blob(self: &mut Session, blob: String, ctx: &TxContext) {
    assert!(self.members.contains(&ctx.sender()), ENoAccess);
    self.event_blob = blob;
}

/// Record renewed storage epoch (invariant #3). Owner-gated.
public fun renew(cap: &SessionCap, self: &mut Session, end_epoch: u64) {
    assert_cap(cap, self);
    self.end_epoch = end_epoch;
}

// ---- the Seal gate ----

/// Returns true iff `id` starts with this session's 32-byte object-id prefix.
fun has_session_prefix(self: &Session, id: &vector<u8>): bool {
    let prefix = object::id(self).to_bytes(); // 32 bytes
    if (id.length() < prefix.length()) return false;
    let mut i = 0;
    while (i < prefix.length()) {
        if (id[i] != prefix[i]) return false;
        i = i + 1;
    };
    true
}

/// Seal policy gate. Key servers dry-run this with the SessionKey's address as
/// sender; an abort means DENY (fail closed, §10). Grants a key iff: caller is a
/// member AND the id is a shared node AND the id carries this session's prefix.
entry fun seal_approve(id: vector<u8>, self: &Session, ctx: &TxContext) {
    assert!(self.members.contains(&ctx.sender()), ENoAccess);
    assert!(has_session_prefix(self, &id), EBadId);
    assert!(self.shared_nodes.contains(&id), ENotShared);
}

// ---- read-only accessors (for tests / off-chain mirrors) ----
public fun head_version(self: &Session): u64 { self.head_version }
public fun head_blob(self: &Session): String { self.head_blob }
public fun event_blob(self: &Session): String { self.event_blob }
public fun end_epoch(self: &Session): u64 { self.end_epoch }
public fun is_member(self: &Session, who: address): bool { self.members.contains(&who) }
public fun is_shared(self: &Session, id: vector<u8>): bool { self.shared_nodes.contains(&id) }
public fun member_count(self: &Session): u64 { self.members.length() }

// ---- in-module tests for the private seal_approve gate (forward-only revocation) ----
#[test_only]
use sui::test_scenario as ts;
#[test_only]
fun valid_seal_id(sess: &Session): vector<u8> {
    let mut id = object::id(sess).to_bytes();
    id.append(b"node-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    id
}

#[test]
fun seal_approve_allows_member_shared_prefixed() {
    let owner = @0xA;
    let mut sc = ts::begin(owner);
    create_session(b"s".to_string(), 100, sc.ctx());
    sc.next_tx(owner);
    let mut sess = sc.take_shared<Session>();
    let cap = sc.take_from_sender<SessionCap>();
    let id = valid_seal_id(&sess);
    share_node(&mut sess, id, sc.ctx());
    seal_approve(id, &sess, sc.ctx()); // member + shared + prefix -> must NOT abort
    ts::return_shared(sess);
    sc.return_to_sender(cap);
    sc.end();
}

#[test]
#[expected_failure(abort_code = ENotShared)]
fun seal_approve_denies_unshared() {
    let owner = @0xA;
    let mut sc = ts::begin(owner);
    create_session(b"s".to_string(), 100, sc.ctx());
    sc.next_tx(owner);
    let sess = sc.take_shared<Session>();
    let cap = sc.take_from_sender<SessionCap>();
    let id = valid_seal_id(&sess); // valid prefix but never shared
    seal_approve(id, &sess, sc.ctx()); // -> ENotShared
    ts::return_shared(sess);
    sc.return_to_sender(cap);
    sc.end();
}

#[test]
#[expected_failure(abort_code = ENoAccess)]
fun seal_approve_denies_nonmember() {
    let owner = @0xA;
    let bob = @0xB;
    let mut sc = ts::begin(owner);
    create_session(b"s".to_string(), 100, sc.ctx());
    sc.next_tx(owner);
    let mut sess = sc.take_shared<Session>();
    let cap = sc.take_from_sender<SessionCap>();
    let id = valid_seal_id(&sess);
    share_node(&mut sess, id, sc.ctx());
    ts::return_shared(sess);
    sc.return_to_sender(cap);
    sc.next_tx(bob); // bob is NOT a member
    let sess2 = sc.take_shared<Session>();
    seal_approve(id, &sess2, sc.ctx()); // sender=bob not member -> ENoAccess
    ts::return_shared(sess2);
    sc.end();
}
