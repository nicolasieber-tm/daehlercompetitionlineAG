// English dictionary. Same structure as de.ts (enforced by the Dictionary
// type). Product names stay German, the brand "dÄHLer" is never
// translated. British English, friendly and precise. "PS" stays "PS" (not
// "hp"): Swiss market convention, and it is part of the product names in
// the product list (e.g. "Stufe 1: (Basis 460 PS) 590PS / 720Nm").
import type { Dictionary } from "./de";

export const en: Dictionary = {
  brand: {
    name: "dÄHLer",
    tagline: "Competition Line · Belp",
    eyebrow: "Your request in a few short steps",
    title: "Your request for more",
    titleHighlight: "Character",
    lede: "Choose your vehicle and your wish. We show you the matching options from our product list, with indicative prices along the way.",
    meta: {
      locationLabel: "Location",
      location: "Belp",
      phoneLabel: "Phone",
      phone: "+41 31 819 88 77",
      responseLabel: "Reply",
      response: "Within 1 working day",
    },
  },

  language: {
    de: "DE",
    en: "EN",
    switchLabel: "Language",
  },

  nav: {
    back: "Back",
    next: "Next",
    submit: "Send request",
    soFar: "So far {price}",
    stepOf: "Step {current} of {total}",
    toInternal: "How this arrives at dÄHLer",
    retry: "Try again",
  },

  priceStatus: {
    // {price} already comes fully formatted incl. prefix from chfFrom()
    // (e.g. "from CHF 4'180"), so no extra prefix here (else "from from ...").
    priced: "{price}",
    in_preparation: "in preparation",
    on_request: "on request",
  },

  steps: {
    car: {
      label: "Your vehicle",
      question: "Which vehicle do you drive?",
      yearLabel: "Year",
      yearOlder: "older",
      beenHereLabel: "Have you been to us before?",
      beenHereNo: "No",
      beenHereYes: "Yes",
      seriesKnown: "{ps} PS standard and {nm} Nm standard",
      seriesUnknown: "We will let you know the standard output personally.",
      seriesPsChoice: "What is the standard output of your vehicle?",
      seriesPsRequired: "Please select your standard output so we can show the right options.",
      gearboxQuestion: "Which gearbox does your vehicle have?",
      gearboxManual: "Manual",
      gearboxAutomatic: "Automatic",
      gearboxUnknown: "I don't know",
      gearboxRequired: "Please select your gearbox so we can show the right options.",
      photoHint: "Prices on file",
      photoFallback: "Photo coming soon",
      carShotCaption: "{model} by dÄHLer",
      fuelGroups: {
        benzin: "Petrol",
        diesel: "Diesel",
        elektro: "Electric",
      },
    },

    wish: {
      label: "Your wish",
      question: "What would you like?",
      subtitle:
        "Choose everything that interests you. We will only ask follow up questions about what you have selected.",
      categories: {
        motor: { title: "Engine", subtitle: "More power, type approved" },
        auspuff: { title: "Exhaust", subtitle: "Sound and looks" },
        fahrwerk: { title: "Suspension", subtitle: "Lower, more precise" },
        raeder: { title: "Wheels", subtitle: "CDC1 and CDC2 Forged" },
        exterieur: { title: "Exterior", subtitle: "Carbon and aerodynamics" },
        interieur: { title: "Interior", subtitle: "Steering wheel, leather, details" },
      },
      completePackage: {
        title: "Or: complete package, advise me",
        subtitle: "Tell us how it should feel, we will put the package together.",
        cta: "Get advice",
        selected: "Selected",
      },
    },

    category: {
      questions: {
        motor: "How much would you like?",
        auspuff: "What sound?",
        fahrwerk: "How low, how firm?",
        raeder: "Which wheels?",
        exterieur: "What would you like added?",
        interieur: "What goes inside?",
      },
      loading: "Loading products …",
      priceHintData:
        "Indicative prices marked \"from\", taken from our product list for the {model}, including fitting, excluding roadworthiness test.",
      priceHintGeneric: "We will let you know the prices for this vehicle personally.",
      variantHint: "One variant, extras can be added freely.",
      multiHint: "Multiple selection possible.",
      motorSections: {
        leistungsstufen: "Power stages",
        weitereOptionen: "More options",
        kraftuebertragung: "Drivetrain",
      },
      sections: {
        anlagen: "Systems",
        endrohre: "Tailpipes",
        weitereOptionen: "More options",
        activeSound: "Active sound",
        fahrwerk: "Suspension",
        bremse: "Brakes",
      },
      psCounter: {
        seriesUnit: "PS standard",
        targetUnitWithStage: "PS with {stage}",
        targetUnitUnselected: "PS · choose a stage",
        plus: "+{diff} PS · {detail}",
      },
      includedInStage: "Included in {stage}",
      followUp: {
        motor: {
          question: "What matters more to you?",
          options: [
            { id: "leistung", label: "More power" },
            { id: "sound", label: "More sound" },
            { id: "beides", label: "Both" },
          ],
        },
        auspuff: {
          question: "How loud may it be?",
          options: [
            { id: "dezent", label: "Discreet, with valve" },
            { id: "kraeftig", label: "Powerful" },
            { id: "rennstrecke", label: "Track day" },
          ],
        },
        fahrwerk: {
          question: "How do you drive it most of the time?",
          options: [
            { id: "alltag", label: "Daily driving" },
            { id: "pass", label: "Mountain passes and corners" },
            { id: "track", label: "Track days" },
          ],
        },
        raeder: {
          question: "Which finish?",
          options: [
            { id: "schwarz", label: "Matt black" },
            { id: "silber", label: "Silver" },
            { id: "wunschfarbe", label: "Colour of choice" },
          ],
        },
      },
      upsell: {
        motor: {
          title: "Goes well with: exhaust",
          text: "Most customers add the exhaust system when increasing power. That way you hear the difference too.",
        },
        auspuff: {
          title: "Goes well with: engine",
          text: "The sound is there, the power is not yet. Stage 1 is software, type approved, with warranty extension.",
        },
        fahrwerk: {
          title: "Goes well with: wheels",
          text: "Lowered but still on standard wheels? The CDC wheel sets fill the arches properly.",
        },
        raeder: {
          title: "Goes well with: suspension",
          text: "New wheels look even better with sports springs.",
        },
        exterieur: {
          title: "Goes well with: interior",
          text: "Carbon outside, standard inside? The Alcantara steering wheel is the touch point you feel every day.",
        },
        interieur: {
          title: "Goes well with: exterior",
          text: "To match: carbon details outside, from the grille to the diffuser.",
        },
      },
      upsellAdd: "Add it",
      upsellAdded: {
        titleSuffix: "is included",
        subtitle: "Comes as the next step.",
        remove: "Remove it",
      },
    },

    character: {
      label: "The character",
      question: "How should your {model} feel in the end?",
      options: [
        {
          id: "dezent",
          title: "Discreet",
          description: "You do not see it, you barely hear it, you feel it.",
        },
        {
          id: "sportlich",
          title: "Sporty",
          description: "Clearly noticeable, yet still practical for everyday use.",
        },
        { id: "maximum", title: "Maximum", description: "Everything that is type approved." },
      ],
      noteLabel: "Anything else we should know? (optional)",
      notePlaceholder:
        "e.g. warranty runs until 2027, or: wheels should match the Frozen paint",
    },

    timing: {
      label: "Almost done",
      question: "When does it suit you?",
      options: [
        { id: "asap", label: "As soon as possible" },
        { id: "m1_2", label: "In 1 to 2 months" },
        { id: "m3_6", label: "In 3 to 6 months" },
        { id: "flexible", label: "Flexible" },
      ],
    },

    contact: {
      label: "And who are you?",
      firstName: "First name",
      lastName: "Last name",
      city: "Town (optional)",
      phone: "Phone",
      email: "Email",
      channelLabel: "How would you like us to reach you?",
      channels: [
        { id: "phone", label: "Phone" },
        { id: "email", label: "Email" },
        { id: "whatsapp", label: "WhatsApp" },
      ],
      privacyNote:
        "By submitting you accept our privacy policy. We will get back to you within one working day with a concrete proposal for your {model}.",
    },

    done: {
      ticketLabel: "Request received · No. {number}",
      title: "Thank you, {first}. This is going to be great.",
      subtitle:
        "Your {model} has been noted. The confirmation with this overview is on its way to {email}. We will check what fits in this combination and get back to you within one working day by {channel}.",
      carShotCaption: "{model} · before / after",
      beforeAfter: {
        header: "Your package",
        before: "Before",
        after: "After · by dÄHLer",
        rows: {
          leistung: "Power",
          sound: "Sound",
          fahrwerk: "Suspension",
          raeder: "Wheels",
          exterieur: "Exterior",
          interieur: "Interior",
          charakter: "Character",
        },
        seriesValue: "Standard",
        seriesHeightValue: "Standard height",
        seriesFactoryValue: "Ex works",
        seriesExhaustValue: "Standard exhaust",
        seriesWheelsValue: "Standard wheels",
        adviceValue: "Advice",
      },
      share: {
        link: {
          title: "Your package as a link",
          subtitle: "To share with friends, your partner, or the regulars' table.",
          success: {
            title: "Link copied",
            subtitle: "Send it to the friend who has been thinking about it for a while too.",
          },
        },
        mail: {
          title: "Send me the summary",
          subtitle: "As an email, with everything you have just chosen.",
          success: {
            title: "On its way to {email}",
            subtitle:
              "Before/after, your package and the indicative price. To show, to consider, to forward.",
          },
        },
      },
      package: {
        header: "Your package",
        adviceLine: "Complete package · advice requested",
        categoryAdviceLine: "Advice requested",
        total: "Indicative price, non binding",
        totalWithOnRequest: "Indicative price, non binding, excluding items on request",
        onRequest: "on request",
      },
      next: {
        now: { title: "Now", text: "The email confirmation is on its way." },
        day1: {
          title: "Within 1 working day",
          text: "A concrete proposal with price and appointment window.",
        },
        then: { title: "Then", text: "You bring it in. We do the rest." },
      },
      restart: "Start again",
      ownRequest: "Start your own request",
    },
  },

  errors: {
    required: "This field is required.",
    invalidEmail: "Please enter a valid email address.",
    selectAtLeastOne: "Please choose at least one category or the complete package.",
    generic: "Something went wrong. Please try again.",
    submitFailed: "Your request could not be sent. Please try again.",
    privacyRequired: "Please accept the privacy policy.",
    loadFailed: "The products could not be loaded.",
    shareCopyFailed: "The link could not be copied.",
    summaryMailFailed: "The summary could not be sent.",
    phoneRequiredForChannel: "Phone is required when contacting you by phone or WhatsApp.",
  },

  mail: {
    shared: {
      viewPackageButton: "View your package",
      beforeAfterTitle: "Before / After",
    },
    confirmation: {
      subject: "Your request for the {model}, No. {number}",
      intro: "Dear {first},",
      body: "Thank you for your request for your {model}. Below is the overview of your package. We will check compatibility and get back to you within one working day with a concrete proposal.",
      closing: "Kind regards from Belp",
      vehicleLabel: "Vehicle",
      wishLabel: "Wish",
      timingLabel: "Timing",
      channelLabel: "Contact",
    },
    inbox: {
      subject: "New request {number}: {vehicle}, {name}",
      intro: "New request via the customer flow on daehler.com. Summary, checks and reply draft below, details in the admin area.",
    },
    reply: {
      footer: "This indicative price is non binding, compatibility will be checked.",
    },
    summary: {
      subject: "Your summary, No. {number}",
      intro: "Dear {first},",
      body: "Here is the summary of your request for your {model}, to show, to consider or to forward.",
      closing: "Kind regards from Belp",
    },
    follow_up: {
      subject: "Your request for the {model}, No. {number}",
      intro: "Dear {first},",
      body: "We wanted to check briefly whether our proposal for your {model} is still of interest. We are happy to clarify any open questions and arrange an appointment.",
      closing: "Kind regards from Belp",
    },
  },

  checks: {
    motor_auspuff_compat:
      "Check compatibility of exhaust system and engine software (align stage with catalytic converters).",
    stufe2_ohne_kats: "Stage 2 selected, high performance catalytic converters not in the package.",
    in_vorbereitung: "An item marked as \"in preparation\" was selected, provide a time frame.",
    fahrwerk_einbausatz:
      "Is the standard suspension adaptive? Fitting kit may be required, align sports springs with EDC.",
    raeder_details: "Clarify tyre size, spacers and colour of choice.",
    exterieur_lack: "Carbon or painted? Obtain the paint code from the vehicle.",
    baujahr_homologation: "Clarify the year, check type approval per engine variant.",
    charakter_maximum_stufe1: "Character \"Maximum\" requested but Stage 1 selected: offer Stage 2.",
    zeitraum_kapazitaet: "Check workshop capacity in the requested time frame.",
    familie_ohne_preisliste: "Vehicle without a price list: add prices and availability manually.",
    produkt_auf_anfrage: "An item with status \"on request\" was selected: confirm the price manually.",
    komplettpaket_gewuenscht: "Complete package requested: put together a proposal based on the character.",
    getriebe_unbekannt:
      "A gearbox-specific item was selected but the gearbox (manual/automatic) is not known: clarify before confirming.",
    vmax_doppelt:
      "The selected power stage already includes the V-max removal, and the standalone V-max item was also selected: duplicate, please clean up.",
    // {alternatives}: the family's concrete alternatives ("X1 / X2"),
    // filled in by runChecks() via tf() (lib/rules/checks.ts,
    // vehicleAmbiguousAlternatives()) instead of generic examples.
    modell_mehrdeutig: "Model series covers {alternatives}, clarify the model with the customer.",
  },

  draft: {
    subject: "Your request for the {vehicle}, No. {number}",
    greeting: "Dear {first} {last}",
    thanks:
      "Thank you for your request for your {model}{yearSuffix}.",
    // See de.ts yearSuffix comment: {model} can already end in brackets
    // (the codes, e.g. "BMW M2 (G87)") - a comma instead of a second pair
    // of brackets keeps "model year" from reading like a nested bracket.
    yearSuffix: ", model year {year}",
    character: {
      dezent: "Discreet yet noticeable, we can do that.",
      sportlich: "Sporty and still practical for everyday use, that is exactly our line.",
      maximum: "\"Maximum\" is music to our ears.",
    },
    itemsIntro: "In principle, we can put this together:",
    itemLine: "• {category}: {name}{description}{price}",
    itemDescription: " ({description})",
    itemPrice: ", from {price}",
    itemPriceInPreparation: ", in preparation",
    itemPriceOnRequest: ", on request",
    itemsFallback: "We will put together a package based on your wish.",
    performanceLine:
      "With {stage} your {model} reaches {detail}, WLTP tested and with a Swiss approval certificate. The one year warranty extension to the factory warranty is included.",
    priceLine:
      "Indicative price for the package: {price}, including fitting, excluding roadworthiness test. We will confirm the final price once {clarification}.",
    priceLineOnRequest:
      "We will let you know the indicative price after a short review, including fitting, excluding roadworthiness test. We will confirm the final price once {clarification}.",
    clarificationFahrwerk: "we know whether your car has the adaptive M suspension",
    clarificationMotorAuspuff: "we have checked the combination of software and exhaust system",
    clarificationGeneric: "we have clarified the details",
    timingFlexible: "We are flexible on timing, just let us know what suits you.",
    timingUnknown: "As soon as we know your preferred timing, we will be happy to reserve a workshop slot for you.",
    timingPhrases: {
      asap: "the coming weeks",
      m1_2: "the period in one to two months",
      m3_6: "the period in three to six months",
    },
    timingFixed:
      "For {timing} we have workshop slots available, we would be happy to reserve one for you once you give us the go ahead.",
    closingCall: "Call us or simply reply to this email, and we will discuss the details.",
    signOff: "Kind regards from Belp",
    // No hardcoded text: name comes from settings.signature_name, {company}
    // from settings.mail_from_name plus optional settings.company_address
    // (only when set) and phone from settings.signature_phone, see
    // lib/draft/template.ts (this also covers the "[Name]" line from the
    // preview). See docs/architektur.md, section Antwortentwurf.
    signature: "{name}\n{company} · {phone}",
  },
};
