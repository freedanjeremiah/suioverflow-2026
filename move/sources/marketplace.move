/// Mycelia marketplace — list a session's graph for sale and grant access on
/// purchase. A Listing escrows the owner's SessionCap, so `purchase` can add the
/// buyer as a session member ON THE OWNER'S BEHALF (Seal then lets them decrypt).
/// Listing also adds an "ask service" address as a member so the public can talk
/// to GPT over the (server-decrypted) knowledge before buying.
module mycelia::marketplace;

use std::string::String;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;
use mycelia::session::{Self, Session, SessionCap};

// ---- errors ----
const EWrongSession: u64 = 1; // passed Session does not match the listing
const EUnderpaid: u64 = 2; // payment below the listing price

/// A graph offered for sale. Shared object; escrows the SessionCap.
public struct Listing has key {
    id: UID,
    session: ID, // the Session whose graph is being sold
    owner: address,
    price: u64, // in MIST (SUI)
    title: String,
    blurb: String,
    cap: SessionCap, // escrowed — used to grant membership on purchase
}

public struct ListingCreated has copy, drop {
    listing: ID,
    session: ID,
    owner: address,
    price: u64,
    title: String,
}
public struct Purchased has copy, drop {
    listing: ID,
    session: ID,
    buyer: address,
    price: u64,
}

/// List `session` for sale. Adds `ask_service` as a member first (so it can
/// decrypt + run GPT for the public), then escrows the cap in the Listing.
public entry fun list_for_sale(
    cap: SessionCap,
    session: &mut Session,
    price: u64,
    title: String,
    blurb: String,
    ask_service: address,
    ctx: &mut TxContext,
) {
    // grant the ask-service decrypt access (cap is asserted inside add_member)
    session::add_member(&cap, session, ask_service);
    let listing = Listing {
        id: object::new(ctx),
        session: object::id(session),
        owner: ctx.sender(),
        price,
        title,
        blurb,
        cap,
    };
    event::emit(ListingCreated {
        listing: object::id(&listing),
        session: object::id(session),
        owner: ctx.sender(),
        price,
        title,
    });
    transfer::share_object(listing);
}

/// Purchase a listing: pay the owner, then grant the buyer membership using the
/// escrowed cap (the share is authorized by the owner's account, via the cap).
public entry fun purchase(
    listing: &mut Listing,
    session: &mut Session,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    assert!(object::id(session) == listing.session, EWrongSession);
    assert!(coin::value(&payment) >= listing.price, EUnderpaid);
    transfer::public_transfer(payment, listing.owner);
    session::add_member(&listing.cap, session, ctx.sender());
    event::emit(Purchased {
        listing: object::id(listing),
        session: listing.session,
        buyer: ctx.sender(),
        price: listing.price,
    });
}

// ---- read accessors (off-chain mirrors) ----
public fun listing_session(l: &Listing): ID { l.session }
public fun listing_owner(l: &Listing): address { l.owner }
public fun listing_price(l: &Listing): u64 { l.price }
public fun listing_title(l: &Listing): String { l.title }
public fun listing_blurb(l: &Listing): String { l.blurb }
