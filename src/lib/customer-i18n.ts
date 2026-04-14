import type { RewardPrizeType } from "@/types/reward";
import type {
  StaffRequestKind,
  StaffRequestOption,
  StaffRequestStatus,
} from "@/types/staff-request";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";

export type CustomerUiCopy = {
  languageLabel: string;
  allCategories: string;
  loading: string;
  errorTitle: string;
  scanQrHelp: string;
  back: string;
  tableLabel: string;
  viewMenu: string;
  welcomeLabel: string;
  welcomeDescription: string;
  menuLabel: string;
  uncategorizedCategory: string;
  yourOrder: string;
  close: string;
  emptyOrder: string;
  addFromMenu: string;
  selectedNotes: string;
  decreaseQuantity: string;
  increaseQuantity: string;
  remove: string;
  subtotal: string;
  discount: string;
  service: string;
  total: string;
  proceedToPayment: string;
  searchPlaceholder: string;
  noItemsFound: string;
  chooseOptionsFirst: string;
  callWaiter: string;
  waiterIntro: string;
  activeRequest: string;
  checkoutBack: string;
  checkoutTitle: string;
  noteForVenue: string;
  noteForKitchen: string;
  optional: string;
  paymentTitle: string;
  paymentIntro: string;
  onlinePaymentOption: string;
  counterPaymentOption: string;
  counterModeTitle: string;
  goToCashier: string;
  goToCashierDetail: string;
  callWaiterForPayment: string;
  callWaiterForPaymentDetail: string;
  tablePaymentMethod: string;
  card: string;
  cash: string;
  onlinePaymentDisabled: string;
  placingOrder: string;
  continueToPayment: string;
  confirmCashier: string;
  confirmWaiter: string;
  chooseCounterModeError: string;
  chooseTablePaymentError: string;
  orderFailed: string;
  networkError: string;
  paymentInitError: string;
  venueWillPrepareAfterPayment: string;
  orderTitle: string;
  orderStatusTitle: string;
  paymentLabel: string;
  itemsTitle: string;
  home: string;
  rewardWheelTitle: string;
  rewardSpinningTitle: string;
  rewardResultTitle: string;
  rewardSpinningText: string;
  rewardPendingLabel: string;
  noPrizeTitle: string;
  noPrizeDescription: string;
  rewardCodeLabel: string;
  rewardCodeHint: string;
  tryAgainLabel: string;
  continueLabel: string;
  notesTitle: string;
  optionsExtra: string;
  required: string;
  chooseOption: string;
  allergens: string;
  quantity: string;
  addToOrder: string;
  payNow: string;
  processing: string;
  paymentCouldNotComplete: string;
  paymentStillProcessing: string;
  waiterSheetTitle: string;
  waiterSheetSubtitle: string;
  waiterSheetSelected: string;
  noneSelected: string;
  sendRequest: string;
  sendingRequest: string;
  waiterCallIdleButton: string;
  waiterCallIdleHelp: string;
  waiterCallPaymentRequested: string;
  waiterCallPaymentRequestedHelp: string;
  waiterCallRequested: string;
  waiterCallRequestedHelp: string;
  waiterCallPaymentInProgress: string;
  waiterCallPaymentInProgressHelp: string;
  waiterCallInProgress: string;
  waiterCallInProgressHelp: string;
  waiterCallAgain: string;
  waiterCallAgainHelp: string;
  waiterStatusSent: string;
  waiterStatusInProgress: string;
  waiterStatusClosed: string;
};

const COPY: Record<RestaurantLanguageCode, CustomerUiCopy> = {
  it: {
    languageLabel: "Lingua",
    allCategories: "Tutto",
    loading: "Caricamento…",
    errorTitle: "Impossibile aprire il menu",
    scanQrHelp: "Scansiona il QR del tuo tavolo per continuare.",
    back: "Indietro",
    tableLabel: "Tavolo",
    viewMenu: "Apri menu",
    welcomeLabel: "Benvenuto",
    welcomeDescription:
      "Sfoglia il menu, ordina dal tavolo e paga quando vuoi. Il locale riceve subito il tuo ordine con il numero del tavolo.",
    menuLabel: "Menu",
    uncategorizedCategory: "Senza categoria",
    yourOrder: "Il tuo ordine",
    close: "Chiudi",
    emptyOrder: "Il tuo ordine e vuoto. Aggiungi qualcosa dal menu.",
    addFromMenu: "Aggiungi dal menu",
    selectedNotes: "Note",
    decreaseQuantity: "Diminuisci quantita",
    increaseQuantity: "Aumenta quantita",
    remove: "Rimuovi",
    subtotal: "Subtotale",
    discount: "Sconto",
    service: "Servizio",
    total: "Totale",
    proceedToPayment: "Vai al pagamento",
    searchPlaceholder: "Cerca",
    noItemsFound: "Nessun prodotto corrisponde alla ricerca.",
    chooseOptionsFirst: "Scegli le opzioni prima del primo aggiungi",
    callWaiter: "Chiama il cameriere",
    waiterIntro: "Invia una richiesta rapida al tavolo anche prima dell'ordine.",
    activeRequest: "Richiesta attiva",
    checkoutBack: "← Torna al menu",
    checkoutTitle: "Pagamento",
    noteForVenue: "Note per il locale",
    noteForKitchen: "Note per la cucina",
    optional: "Facoltativo",
    paymentTitle: "Pagamento",
    paymentIntro:
      "L'ordine parte solo dopo il pagamento. Se scegli il pagamento al tavolo, il cameriere arriva prima, incassa e solo dopo l'ordine entra in lavorazione.",
    onlinePaymentOption: "Carta, Apple Pay o Google Pay",
    counterPaymentOption: "Paga al banco",
    counterModeTitle: "Scegli dove pagare prima che l'ordine parta",
    goToCashier: "Vai alla cassa",
    goToCashierDetail:
      "Vai in cassa, paghi e solo dopo l'ordine parte in lavorazione.",
    callWaiterForPayment: "Chiama cameriere",
    callWaiterForPaymentDetail:
      "Il locale riceve una richiesta pagamento al tavolo. Il cameriere arriva, incassa e poi l'ordine parte.",
    tablePaymentMethod: "Come pagherai al tavolo?",
    card: "Carta",
    cash: "Contanti",
    onlinePaymentDisabled:
      "Il pagamento online non e disponibile per questo locale. Scegli il pagamento al banco.",
    placingOrder: "Invio ordine…",
    continueToPayment: "Continua al pagamento",
    confirmCashier: "Conferma richiesta e vai alla cassa",
    confirmWaiter: "Conferma richiesta e chiama il cameriere",
    chooseCounterModeError: "Scegli se vuoi andare in cassa o chiamare il cameriere.",
    chooseTablePaymentError: "Scegli se pagherai con carta o contanti al tavolo.",
    orderFailed: "Invio ordine non riuscito.",
    networkError: "Errore di rete. Riprova.",
    paymentInitError:
      "Il pagamento non puo essere avviato. Controlla la configurazione Stripe.",
    venueWillPrepareAfterPayment:
      "Dopo il pagamento potrai ricevere il tuo ordine.",
    orderTitle: "Ordine",
    orderStatusTitle: "Stato ordine",
    paymentLabel: "Pagamento",
    itemsTitle: "Prodotti",
    home: "Home",
    rewardWheelTitle: "Ruota della fortuna",
    rewardSpinningTitle: "La ruota sta girando",
    rewardResultTitle: "Il tuo risultato",
    rewardSpinningText:
      "Scopri con un ultimo gesto se la prossima visita avra un regalo speciale.",
    rewardPendingLabel: "Estrazione in corso",
    noPrizeTitle: "Nessun premio",
    noPrizeDescription:
      "Peccato! Questa volta non hai vinto, ma potrai riprovare al prossimo ordine.",
    rewardCodeLabel: "Codice univoco",
    rewardCodeHint:
      "Valido una sola volta e verificabile solo dal locale nel sistema interno.",
    tryAgainLabel: "Riprova la prossima volta",
    continueLabel: "Continua",
    notesTitle: "Note",
    optionsExtra: "+ opzioni",
    required: "Obbligatorio",
    chooseOption: "Scegli un'opzione",
    allergens: "Allergeni",
    quantity: "Quantita",
    addToOrder: "Aggiungi all'ordine",
    payNow: "Paga ora",
    processing: "Elaborazione…",
    paymentCouldNotComplete: "Il pagamento non puo essere completato.",
    paymentStillProcessing:
      "Il pagamento e ancora in elaborazione. Attendi un momento.",
    waiterSheetTitle: "Invia una richiesta rapida",
    waiterSheetSubtitle:
      "Se vuoi, puoi indicare il motivo della chiamata. Altrimenti inviala subito.",
    waiterSheetSelected: "Richiesta selezionata",
    noneSelected: "Nessuna",
    sendRequest: "Invia richiesta",
    sendingRequest: "Invio in corso…",
    waiterCallIdleButton: "Chiama il cameriere",
    waiterCallIdleHelp:
      "Se hai bisogno di aiuto al tavolo, avvisa il locale con un tocco.",
    waiterCallPaymentRequested: "Pagamento al tavolo richiesto",
    waiterCallPaymentRequestedHelp:
      "Il locale ha ricevuto la tua richiesta di pagamento. L'ordine partira solo dopo l'incasso.",
    waiterCallRequested: "Richiesta inviata",
    waiterCallRequestedHelp:
      "Il locale ha ricevuto la tua chiamata e arrivera al tavolo a breve.",
    waiterCallPaymentInProgress: "Pagamento in gestione",
    waiterCallPaymentInProgressHelp:
      "Lo staff sta completando il pagamento. L'ordine partira subito dopo.",
    waiterCallInProgress: "Richiesta presa in carico",
    waiterCallInProgressHelp:
      "Un membro dello staff sta gia seguendo la tua richiesta.",
    waiterCallAgain: "Chiama di nuovo",
    waiterCallAgainHelp:
      "La richiesta precedente e stata chiusa. Puoi inviarne un'altra se serve.",
    waiterStatusSent: "Stato richiesta: inviata",
    waiterStatusInProgress: "Stato richiesta: presa in carico",
    waiterStatusClosed: "Stato richiesta: chiusa",
  },
  en: {
    languageLabel: "Language",
    allCategories: "All",
    loading: "Loading…",
    errorTitle: "Unable to open menu",
    scanQrHelp: "Please scan the QR code on your table to continue.",
    back: "Back",
    tableLabel: "Table",
    viewMenu: "View menu",
    welcomeLabel: "Welcome",
    welcomeDescription:
      "Browse the menu, order from your table, and pay when you are ready. The venue receives your order right away with your table number.",
    menuLabel: "Menu",
    uncategorizedCategory: "Uncategorized",
    yourOrder: "Your order",
    close: "Close",
    emptyOrder: "Your order is empty. Add something from the menu.",
    addFromMenu: "Add from the menu",
    selectedNotes: "Notes",
    decreaseQuantity: "Decrease quantity",
    increaseQuantity: "Increase quantity",
    remove: "Remove",
    subtotal: "Subtotal",
    discount: "Discount",
    service: "Service",
    total: "Total",
    proceedToPayment: "Proceed to payment",
    searchPlaceholder: "Search",
    noItemsFound: "No items match your search.",
    chooseOptionsFirst: "Choose options before first add",
    callWaiter: "Call the waiter",
    waiterIntro: "Send a quick request to the table even before ordering.",
    activeRequest: "Active request",
    checkoutBack: "← Back to menu",
    checkoutTitle: "Payment",
    noteForVenue: "Note for the venue",
    noteForKitchen: "Note for the kitchen",
    optional: "Optional",
    paymentTitle: "Payment",
    paymentIntro:
      "Your order starts only after payment. If you choose table payment, the waiter comes first, takes payment, and only then the order starts.",
    onlinePaymentOption: "Card, Apple Pay, or Google Pay",
    counterPaymentOption: "Pay at counter",
    counterModeTitle: "Choose where to pay before the order starts",
    goToCashier: "Go to cashier",
    goToCashierDetail:
      "Go to the cashier, pay there, and only then the order starts.",
    callWaiterForPayment: "Call waiter",
    callWaiterForPaymentDetail:
      "The venue receives a table payment request. The waiter comes first, takes payment, and then the order starts.",
    tablePaymentMethod: "How will you pay at the table?",
    card: "Card",
    cash: "Cash",
    onlinePaymentDisabled:
      "Online payment is not available for this venue. Choose pay at counter.",
    placingOrder: "Placing order…",
    continueToPayment: "Continue to payment",
    confirmCashier: "Confirm request and go to cashier",
    confirmWaiter: "Confirm request and call waiter",
    chooseCounterModeError: "Choose whether to go to the cashier or call the waiter.",
    chooseTablePaymentError:
      "Choose whether you will pay by card or cash at the table.",
    orderFailed: "Order failed.",
    networkError: "Network error. Try again.",
    paymentInitError: "Payment could not be started. Check Stripe setup.",
    venueWillPrepareAfterPayment:
      "After payment, your order can start being prepared.",
    orderTitle: "Order",
    orderStatusTitle: "Order status",
    paymentLabel: "Payment",
    itemsTitle: "Items",
    home: "Home",
    rewardWheelTitle: "Lucky wheel",
    rewardSpinningTitle: "The wheel is spinning",
    rewardResultTitle: "Your result",
    rewardSpinningText:
      "One last spin to discover whether your next visit includes a special treat.",
    rewardPendingLabel: "Drawing in progress",
    noPrizeTitle: "No prize",
    noPrizeDescription:
      "Too bad! You did not win this time, but you can try again with your next order.",
    rewardCodeLabel: "Unique code",
    rewardCodeHint:
      "Valid once only and verifiable by the venue through the internal system.",
    tryAgainLabel: "Try again next time",
    continueLabel: "Continue",
    notesTitle: "Notes",
    optionsExtra: "+ options",
    required: "Required",
    chooseOption: "Choose an option",
    allergens: "Allergens",
    quantity: "Quantity",
    addToOrder: "Add to order",
    payNow: "Pay now",
    processing: "Processing…",
    paymentCouldNotComplete: "Payment could not be completed.",
    paymentStillProcessing: "Payment is still processing. Please wait a moment.",
    waiterSheetTitle: "Send a quick request",
    waiterSheetSubtitle:
      "If you want, you can say why. Otherwise just send it now.",
    waiterSheetSelected: "Selected request",
    noneSelected: "None",
    sendRequest: "Send request",
    sendingRequest: "Sending…",
    waiterCallIdleButton: "Call the waiter",
    waiterCallIdleHelp:
      "If you need help at the table, notify the venue with one tap.",
    waiterCallPaymentRequested: "Table payment requested",
    waiterCallPaymentRequestedHelp:
      "The venue received your payment request. The order will start only after payment.",
    waiterCallRequested: "Request sent",
    waiterCallRequestedHelp:
      "The venue received your call and will come to the table shortly.",
    waiterCallPaymentInProgress: "Payment in progress",
    waiterCallPaymentInProgressHelp:
      "The staff is handling payment now. The order will start right after payment.",
    waiterCallInProgress: "Request in progress",
    waiterCallInProgressHelp:
      "A staff member is already handling your request.",
    waiterCallAgain: "Call again",
    waiterCallAgainHelp:
      "The previous request has been closed. You can send another one if needed.",
    waiterStatusSent: "Request status: sent",
    waiterStatusInProgress: "Request status: in progress",
    waiterStatusClosed: "Request status: closed",
  },
  fr: {
    languageLabel: "Langue",
    allCategories: "Tout",
    loading: "Chargement…",
    errorTitle: "Impossible d'ouvrir le menu",
    scanQrHelp: "Veuillez scanner le QR code de votre table pour continuer.",
    back: "Retour",
    tableLabel: "Table",
    viewMenu: "Voir le menu",
    welcomeLabel: "Bienvenue",
    welcomeDescription:
      "Parcourez le menu, commandez depuis votre table et payez quand vous voulez. Le lieu recoit immediatement votre commande avec le numero de table.",
    menuLabel: "Menu",
    uncategorizedCategory: "Sans categorie",
    yourOrder: "Votre commande",
    close: "Fermer",
    emptyOrder: "Votre commande est vide. Ajoutez quelque chose du menu.",
    addFromMenu: "Ajouter depuis le menu",
    selectedNotes: "Notes",
    decreaseQuantity: "Diminuer la quantite",
    increaseQuantity: "Augmenter la quantite",
    remove: "Retirer",
    subtotal: "Sous-total",
    discount: "Remise",
    service: "Service",
    total: "Total",
    proceedToPayment: "Passer au paiement",
    searchPlaceholder: "Rechercher",
    noItemsFound: "Aucun produit ne correspond a votre recherche.",
    chooseOptionsFirst: "Choisissez les options avant le premier ajout",
    callWaiter: "Appeler le serveur",
    waiterIntro: "Envoyez une demande rapide a la table meme avant la commande.",
    activeRequest: "Demande active",
    checkoutBack: "← Retour au menu",
    checkoutTitle: "Paiement",
    noteForVenue: "Note pour le lieu",
    noteForKitchen: "Note pour la cuisine",
    optional: "Facultatif",
    paymentTitle: "Paiement",
    paymentIntro:
      "Le lieu commencera a preparer votre commande apres confirmation du paiement pour garder un service rapide et precis.",
    onlinePaymentOption: "Carte, Apple Pay ou Google Pay",
    counterPaymentOption: "Payer au comptoir",
    counterModeTitle: "Choisissez comment terminer le paiement",
    goToCashier: "Aller a la caisse",
    goToCashierDetail: "Vous allez a la caisse et terminez le paiement la-bas.",
    callWaiterForPayment: "Appeler le serveur",
    callWaiterForPaymentDetail:
      "Le lieu recoit une demande de paiement a la table.",
    tablePaymentMethod: "Comment paierez-vous a table ?",
    card: "Carte",
    cash: "Especes",
    onlinePaymentDisabled:
      "Le paiement en ligne n'est pas disponible pour ce lieu. Choisissez le paiement au comptoir.",
    placingOrder: "Envoi de la commande…",
    continueToPayment: "Continuer vers le paiement",
    confirmCashier: "Confirmer et aller a la caisse",
    confirmWaiter: "Confirmer et appeler le serveur",
    chooseCounterModeError:
      "Choisissez si vous voulez aller a la caisse ou appeler le serveur.",
    chooseTablePaymentError:
      "Choisissez si vous paierez par carte ou en especes a la table.",
    orderFailed: "La commande a echoue.",
    networkError: "Erreur reseau. Reessayez.",
    paymentInitError:
      "Le paiement n'a pas pu demarrer. Verifiez la configuration Stripe.",
    venueWillPrepareAfterPayment:
      "Apres le paiement, votre commande pourra etre preparee.",
    orderTitle: "Commande",
    orderStatusTitle: "Statut de la commande",
    paymentLabel: "Paiement",
    itemsTitle: "Produits",
    home: "Accueil",
    rewardWheelTitle: "Roue de la chance",
    rewardSpinningTitle: "La roue tourne",
    rewardResultTitle: "Votre resultat",
    rewardSpinningText:
      "Un dernier tour pour decouvrir si votre prochaine visite reserve une attention speciale.",
    rewardPendingLabel: "Tirage en cours",
    noPrizeTitle: "Aucun cadeau",
    noPrizeDescription:
      "Dommage ! Vous n'avez rien gagne cette fois, mais vous pourrez reessayer lors de la prochaine commande.",
    rewardCodeLabel: "Code unique",
    rewardCodeHint:
      "Valable une seule fois et verifiable uniquement par le lieu via le systeme interne.",
    tryAgainLabel: "Reessayez la prochaine fois",
    continueLabel: "Continuer",
    notesTitle: "Notes",
    optionsExtra: "+ options",
    required: "Obligatoire",
    chooseOption: "Choisissez une option",
    allergens: "Allergenes",
    quantity: "Quantite",
    addToOrder: "Ajouter a la commande",
    payNow: "Payer maintenant",
    processing: "Traitement…",
    paymentCouldNotComplete: "Le paiement n'a pas pu etre finalise.",
    paymentStillProcessing:
      "Le paiement est encore en cours. Veuillez patienter un instant.",
    waiterSheetTitle: "Envoyer une demande rapide",
    waiterSheetSubtitle:
      "Si vous voulez, vous pouvez indiquer le motif. Sinon, envoyez-la tout de suite.",
    waiterSheetSelected: "Demande selectionnee",
    noneSelected: "Aucune",
    sendRequest: "Envoyer la demande",
    sendingRequest: "Envoi en cours…",
    waiterCallIdleButton: "Appeler le serveur",
    waiterCallIdleHelp:
      "Si vous avez besoin d'aide a table, prevenez le lieu en un geste.",
    waiterCallPaymentRequested: "Paiement a table demande",
    waiterCallPaymentRequestedHelp:
      "Le lieu a recu votre demande de paiement a la table.",
    waiterCallRequested: "Demande envoyee",
    waiterCallRequestedHelp:
      "Le lieu a recu votre appel et arrivera bientot a la table.",
    waiterCallPaymentInProgress: "Paiement en cours",
    waiterCallPaymentInProgressHelp:
      "Le staff se dirige vers la table pour terminer le paiement.",
    waiterCallInProgress: "Demande prise en charge",
    waiterCallInProgressHelp:
      "Un membre du staff suit deja votre demande.",
    waiterCallAgain: "Rappeler",
    waiterCallAgainHelp:
      "La demande precedente a ete fermee. Vous pouvez en envoyer une autre si besoin.",
    waiterStatusSent: "Statut de la demande : envoyee",
    waiterStatusInProgress: "Statut de la demande : en cours",
    waiterStatusClosed: "Statut de la demande : fermee",
  },
  es: {
    languageLabel: "Idioma",
    allCategories: "Todo",
    loading: "Cargando…",
    errorTitle: "No se puede abrir el menu",
    scanQrHelp: "Escanea el codigo QR de tu mesa para continuar.",
    back: "Volver",
    tableLabel: "Mesa",
    viewMenu: "Ver menu",
    welcomeLabel: "Bienvenido",
    welcomeDescription:
      "Consulta el menu, pide desde tu mesa y paga cuando quieras. El local recibe tu pedido enseguida con el numero de mesa.",
    menuLabel: "Menu",
    uncategorizedCategory: "Sin categoria",
    yourOrder: "Tu pedido",
    close: "Cerrar",
    emptyOrder: "Tu pedido esta vacio. Anade algo del menu.",
    addFromMenu: "Anadir desde el menu",
    selectedNotes: "Notas",
    decreaseQuantity: "Disminuir cantidad",
    increaseQuantity: "Aumentar cantidad",
    remove: "Eliminar",
    subtotal: "Subtotal",
    discount: "Descuento",
    service: "Servicio",
    total: "Total",
    proceedToPayment: "Ir al pago",
    searchPlaceholder: "Buscar",
    noItemsFound: "Ningun producto coincide con tu busqueda.",
    chooseOptionsFirst: "Elige las opciones antes del primer anadir",
    callWaiter: "Llamar al camarero",
    waiterIntro: "Envia una solicitud rapida a la mesa incluso antes de pedir.",
    activeRequest: "Solicitud activa",
    checkoutBack: "← Volver al menu",
    checkoutTitle: "Pago",
    noteForVenue: "Nota para el local",
    noteForKitchen: "Nota para cocina",
    optional: "Opcional",
    paymentTitle: "Pago",
    paymentIntro:
      "El local empezara a preparar tu pedido despues de la confirmacion del pago para mantener un servicio rapido y preciso.",
    onlinePaymentOption: "Tarjeta, Apple Pay o Google Pay",
    counterPaymentOption: "Pagar en caja",
    counterModeTitle: "Elige como quieres completar el pago",
    goToCashier: "Ir a caja",
    goToCashierDetail: "Vas a la caja y completas alli el pago.",
    callWaiterForPayment: "Llamar camarero",
    callWaiterForPaymentDetail:
      "El local recibe una solicitud de pago en la mesa.",
    tablePaymentMethod: "Como pagaras en la mesa?",
    card: "Tarjeta",
    cash: "Efectivo",
    onlinePaymentDisabled:
      "El pago online no esta disponible para este local. Elige pago en caja.",
    placingOrder: "Enviando pedido…",
    continueToPayment: "Continuar al pago",
    confirmCashier: "Confirmar e ir a caja",
    confirmWaiter: "Confirmar y llamar al camarero",
    chooseCounterModeError:
      "Elige si quieres ir a caja o llamar al camarero.",
    chooseTablePaymentError:
      "Elige si pagaras con tarjeta o en efectivo en la mesa.",
    orderFailed: "No se pudo enviar el pedido.",
    networkError: "Error de red. Intentalo de nuevo.",
    paymentInitError:
      "No se pudo iniciar el pago. Revisa la configuracion de Stripe.",
    venueWillPrepareAfterPayment:
      "Despues del pago tu pedido podra empezar a prepararse.",
    orderTitle: "Pedido",
    orderStatusTitle: "Estado del pedido",
    paymentLabel: "Pago",
    itemsTitle: "Productos",
    home: "Inicio",
    rewardWheelTitle: "Ruleta de la suerte",
    rewardSpinningTitle: "La ruleta esta girando",
    rewardResultTitle: "Tu resultado",
    rewardSpinningText:
      "Un ultimo giro para descubrir si tu proxima visita tendra un regalo especial.",
    rewardPendingLabel: "Sorteo en curso",
    noPrizeTitle: "Sin premio",
    noPrizeDescription:
      "Que pena! Esta vez no has ganado, pero podras volver a intentarlo en tu proximo pedido.",
    rewardCodeLabel: "Codigo unico",
    rewardCodeHint:
      "Valido una sola vez y verificable solo por el local en el sistema interno.",
    tryAgainLabel: "Pruebalo la proxima vez",
    continueLabel: "Continuar",
    notesTitle: "Notas",
    optionsExtra: "+ opciones",
    required: "Obligatorio",
    chooseOption: "Elige una opcion",
    allergens: "Alergenos",
    quantity: "Cantidad",
    addToOrder: "Anadir al pedido",
    payNow: "Pagar ahora",
    processing: "Procesando…",
    paymentCouldNotComplete: "No se pudo completar el pago.",
    paymentStillProcessing:
      "El pago sigue procesandose. Espera un momento.",
    waiterSheetTitle: "Enviar una solicitud rapida",
    waiterSheetSubtitle:
      "Si quieres, puedes indicar el motivo. Si no, enviala ahora.",
    waiterSheetSelected: "Solicitud seleccionada",
    noneSelected: "Ninguna",
    sendRequest: "Enviar solicitud",
    sendingRequest: "Enviando…",
    waiterCallIdleButton: "Llamar al camarero",
    waiterCallIdleHelp:
      "Si necesitas ayuda en la mesa, avisa al local con un toque.",
    waiterCallPaymentRequested: "Pago en mesa solicitado",
    waiterCallPaymentRequestedHelp:
      "El local ha recibido tu solicitud de pago en la mesa.",
    waiterCallRequested: "Solicitud enviada",
    waiterCallRequestedHelp:
      "El local ha recibido tu llamada y llegara a la mesa enseguida.",
    waiterCallPaymentInProgress: "Pago en gestion",
    waiterCallPaymentInProgressHelp:
      "El personal esta llegando a la mesa para completar el pago.",
    waiterCallInProgress: "Solicitud en curso",
    waiterCallInProgressHelp:
      "Un miembro del staff ya esta atendiendo tu solicitud.",
    waiterCallAgain: "Llamar de nuevo",
    waiterCallAgainHelp:
      "La solicitud anterior se cerro. Puedes enviar otra si hace falta.",
    waiterStatusSent: "Estado de la solicitud: enviada",
    waiterStatusInProgress: "Estado de la solicitud: en curso",
    waiterStatusClosed: "Estado de la solicitud: cerrada",
  },
  de: {
    languageLabel: "Sprache",
    allCategories: "Alle",
    loading: "Laden…",
    errorTitle: "Menue kann nicht geoeffnet werden",
    scanQrHelp: "Bitte scanne den QR-Code deines Tisches, um fortzufahren.",
    back: "Zurueck",
    tableLabel: "Tisch",
    viewMenu: "Menue ansehen",
    welcomeLabel: "Willkommen",
    welcomeDescription:
      "Sieh dir das Menue an, bestelle direkt am Tisch und bezahle, wenn du bereit bist. Das Lokal erhaelt deine Bestellung sofort mit deiner Tischnummer.",
    menuLabel: "Menue",
    uncategorizedCategory: "Ohne Kategorie",
    yourOrder: "Deine Bestellung",
    close: "Schliessen",
    emptyOrder: "Deine Bestellung ist leer. Fuege etwas aus dem Menue hinzu.",
    addFromMenu: "Aus dem Menue hinzufuegen",
    selectedNotes: "Notizen",
    decreaseQuantity: "Menge verringern",
    increaseQuantity: "Menge erhoehen",
    remove: "Entfernen",
    subtotal: "Zwischensumme",
    discount: "Rabatt",
    service: "Service",
    total: "Gesamt",
    proceedToPayment: "Zum Bezahlen",
    searchPlaceholder: "Suchen",
    noItemsFound: "Keine Produkte passen zu deiner Suche.",
    chooseOptionsFirst: "Waehle Optionen vor dem ersten Hinzufuegen",
    callWaiter: "Kellner rufen",
    waiterIntro: "Sende schon vor der Bestellung eine schnelle Tischanfrage.",
    activeRequest: "Aktive Anfrage",
    checkoutBack: "← Zurueck zum Menue",
    checkoutTitle: "Bezahlung",
    noteForVenue: "Hinweis fuer das Lokal",
    noteForKitchen: "Hinweis fuer die Kueche",
    optional: "Optional",
    paymentTitle: "Bezahlung",
    paymentIntro:
      "Das Lokal beginnt erst nach Zahlungsbestaetigung mit der Zubereitung, damit der Service schnell und praezise bleibt.",
    onlinePaymentOption: "Karte, Apple Pay oder Google Pay",
    counterPaymentOption: "An der Kasse zahlen",
    counterModeTitle: "Waehle, wie du die Zahlung abschliessen moechtest",
    goToCashier: "Zur Kasse gehen",
    goToCashierDetail: "Du gehst selbst zur Kasse und schliesst die Zahlung dort ab.",
    callWaiterForPayment: "Kellner rufen",
    callWaiterForPaymentDetail:
      "Das Lokal erhaelt eine Tischanfrage fuer die Zahlung.",
    tablePaymentMethod: "Wie wirst du am Tisch bezahlen?",
    card: "Karte",
    cash: "Bar",
    onlinePaymentDisabled:
      "Online-Zahlung ist fuer dieses Lokal nicht verfuegbar. Bitte waehle Kasse.",
    placingOrder: "Bestellung wird gesendet…",
    continueToPayment: "Weiter zur Bezahlung",
    confirmCashier: "Bestaetigen und zur Kasse gehen",
    confirmWaiter: "Bestaetigen und Kellner rufen",
    chooseCounterModeError:
      "Waehle, ob du zur Kasse gehst oder den Kellner rufst.",
    chooseTablePaymentError:
      "Waehle, ob du am Tisch mit Karte oder bar bezahlen wirst.",
    orderFailed: "Bestellung fehlgeschlagen.",
    networkError: "Netzwerkfehler. Bitte erneut versuchen.",
    paymentInitError:
      "Die Zahlung konnte nicht gestartet werden. Pruefe die Stripe-Konfiguration.",
    venueWillPrepareAfterPayment:
      "Nach der Zahlung kann deine Bestellung zubereitet werden.",
    orderTitle: "Bestellung",
    orderStatusTitle: "Bestellstatus",
    paymentLabel: "Bezahlung",
    itemsTitle: "Produkte",
    home: "Start",
    rewardWheelTitle: "Gluecksrad",
    rewardSpinningTitle: "Das Rad dreht sich",
    rewardResultTitle: "Dein Ergebnis",
    rewardSpinningText:
      "Ein letzter Dreh, um zu sehen, ob dein naechster Besuch eine besondere Ueberraschung bringt.",
    rewardPendingLabel: "Auslosung laeuft",
    noPrizeTitle: "Kein Gewinn",
    noPrizeDescription:
      "Schade! Diesmal hast du nicht gewonnen, aber bei der naechsten Bestellung kannst du es erneut versuchen.",
    rewardCodeLabel: "Einmaliger Code",
    rewardCodeHint:
      "Nur einmal gueltig und nur vom Lokal im internen System verifizierbar.",
    tryAgainLabel: "Versuche es naechstes Mal erneut",
    continueLabel: "Weiter",
    notesTitle: "Notizen",
    optionsExtra: "+ Optionen",
    required: "Pflicht",
    chooseOption: "Option waehlen",
    allergens: "Allergene",
    quantity: "Menge",
    addToOrder: "Zur Bestellung hinzufuegen",
    payNow: "Jetzt bezahlen",
    processing: "Verarbeitung…",
    paymentCouldNotComplete: "Die Zahlung konnte nicht abgeschlossen werden.",
    paymentStillProcessing:
      "Die Zahlung wird noch verarbeitet. Bitte warte einen Moment.",
    waiterSheetTitle: "Schnelle Anfrage senden",
    waiterSheetSubtitle:
      "Wenn du moechtest, kannst du den Grund angeben. Sonst sende sie direkt.",
    waiterSheetSelected: "Ausgewaehlte Anfrage",
    noneSelected: "Keine",
    sendRequest: "Anfrage senden",
    sendingRequest: "Senden…",
    waiterCallIdleButton: "Kellner rufen",
    waiterCallIdleHelp:
      "Wenn du Hilfe am Tisch brauchst, informiere das Lokal mit einem Tipp.",
    waiterCallPaymentRequested: "Tischzahlung angefragt",
    waiterCallPaymentRequestedHelp:
      "Das Lokal hat deine Anfrage fuer die Zahlung am Tisch erhalten.",
    waiterCallRequested: "Anfrage gesendet",
    waiterCallRequestedHelp:
      "Das Lokal hat deinen Ruf erhalten und kommt gleich zum Tisch.",
    waiterCallPaymentInProgress: "Zahlung in Bearbeitung",
    waiterCallPaymentInProgressHelp:
      "Das Personal kommt zum Tisch, um die Zahlung abzuschliessen.",
    waiterCallInProgress: "Anfrage in Bearbeitung",
    waiterCallInProgressHelp:
      "Ein Mitarbeiter kuemmert sich bereits um deine Anfrage.",
    waiterCallAgain: "Noch einmal rufen",
    waiterCallAgainHelp:
      "Die vorige Anfrage wurde geschlossen. Du kannst bei Bedarf eine neue senden.",
    waiterStatusSent: "Anfragestatus: gesendet",
    waiterStatusInProgress: "Anfragestatus: in Bearbeitung",
    waiterStatusClosed: "Anfragestatus: geschlossen",
  },
};

const PAYMENT_STATUS_LABELS: Record<
  RestaurantLanguageCode,
  Record<string, string>
> = {
  it: {
    not_required: "non richiesto",
    pending: "in attesa",
    paid: "pagato",
    paid_online: "pagato online",
    paid_cash: "pagato in contanti",
    paid_counter_card: "pagato con carta in cassa",
    paid_at_table: "pagato al tavolo",
    failed: "fallito",
    refunded: "rimborsato",
  },
  en: {
    not_required: "not required",
    pending: "pending",
    paid: "paid",
    paid_online: "paid online",
    paid_cash: "paid cash",
    paid_counter_card: "paid by card at counter",
    paid_at_table: "paid at table",
    failed: "failed",
    refunded: "refunded",
  },
  fr: {
    not_required: "non requis",
    pending: "en attente",
    paid: "paye",
    paid_online: "paye en ligne",
    paid_cash: "paye en especes",
    paid_counter_card: "paye par carte en caisse",
    paid_at_table: "paye a table",
    failed: "echoue",
    refunded: "rembourse",
  },
  es: {
    not_required: "no requerido",
    pending: "pendiente",
    paid: "pagado",
    paid_online: "pagado online",
    paid_cash: "pagado en efectivo",
    paid_counter_card: "pagado con tarjeta en caja",
    paid_at_table: "pagado en mesa",
    failed: "fallido",
    refunded: "reembolsado",
  },
  de: {
    not_required: "nicht erforderlich",
    pending: "ausstehend",
    paid: "bezahlt",
    paid_online: "online bezahlt",
    paid_cash: "bar bezahlt",
    paid_counter_card: "mit Karte an der Kasse bezahlt",
    paid_at_table: "am Tisch bezahlt",
    failed: "fehlgeschlagen",
    refunded: "erstattet",
  },
};

const STAFF_REQUEST_OPTION_LABELS: Record<
  RestaurantLanguageCode,
  Record<StaffRequestOption, string>
> = {
  it: {
    general: "Assistenza generica",
    ordering: "Ordinazione",
    payment_counter: "Pagamento cassa",
    payment_card: "Pagamento con carta",
    payment_cash: "Pagamento in contanti",
    cutlery_napkins: "Posate / tovaglioli",
    assistance: "Assistenza generica",
    table_cleanup: "Pulizia tavolo",
    order_information: "Informazione su ordine",
  },
  en: {
    general: "General assistance",
    ordering: "Place order",
    payment_counter: "Counter payment",
    payment_card: "Card payment",
    payment_cash: "Cash payment",
    cutlery_napkins: "Cutlery / napkins",
    assistance: "General assistance",
    table_cleanup: "Table cleaning",
    order_information: "Order information",
  },
  fr: {
    general: "Assistance generale",
    ordering: "Commander",
    payment_counter: "Paiement caisse",
    payment_card: "Paiement par carte",
    payment_cash: "Paiement en especes",
    cutlery_napkins: "Couverts / serviettes",
    assistance: "Assistance generale",
    table_cleanup: "Nettoyage de table",
    order_information: "Information sur la commande",
  },
  es: {
    general: "Asistencia general",
    ordering: "Pedir",
    payment_counter: "Pago en caja",
    payment_card: "Pago con tarjeta",
    payment_cash: "Pago en efectivo",
    cutlery_napkins: "Cubiertos / servilletas",
    assistance: "Asistencia general",
    table_cleanup: "Limpieza de mesa",
    order_information: "Informacion sobre el pedido",
  },
  de: {
    general: "Allgemeine Hilfe",
    ordering: "Bestellen",
    payment_counter: "Zahlung an der Kasse",
    payment_card: "Kartenzahlung",
    payment_cash: "Barzahlung",
    cutlery_napkins: "Besteck / Servietten",
    assistance: "Allgemeine Hilfe",
    table_cleanup: "Tischreinigung",
    order_information: "Information zur Bestellung",
  },
};

const ORDER_STATUS_LABELS: Record<
  RestaurantLanguageCode,
  Record<"new" | "preparing" | "ready" | "served", string>
> = {
  it: {
    new: "Nuovo",
    preparing: "In preparazione",
    ready: "Pronto",
    served: "Servito",
  },
  en: {
    new: "New",
    preparing: "Preparing",
    ready: "Ready",
    served: "Served",
  },
  fr: {
    new: "Nouveau",
    preparing: "Preparation",
    ready: "Pret",
    served: "Servi",
  },
  es: {
    new: "Nuevo",
    preparing: "En preparacion",
    ready: "Listo",
    served: "Servido",
  },
  de: {
    new: "Neu",
    preparing: "In Zubereitung",
    ready: "Bereit",
    served: "Serviert",
  },
};

const REWARD_COPY: Record<
  RestaurantLanguageCode,
  Record<
    RewardPrizeType,
    { wheelLabel: string; title: string; description: string; winner: boolean }
  >
> = {
  it: {
    none: {
      wheelLabel: "Nessun premio",
      title: "Nessun premio",
      description:
        "Peccato! Questa volta non hai vinto, ma potrai riprovare al prossimo ordine.",
      winner: false,
    },
    cocktail: {
      wheelLabel: "Cocktail gratis",
      title: "Cocktail gratis",
      description:
        "La prossima volta che vieni a trovarci, hai un cocktail omaggio.",
      winner: true,
    },
    cocktail_plus_aperitivo: {
      wheelLabel: "Cocktail + aperitivo gratis",
      title: "Cocktail + aperitivo gratis",
      description:
        "La prossima volta che vieni con 5 persone, avrai il tuo cocktail offerto e un aperitivo da condividere con gli amici.",
      winner: true,
    },
  },
  en: {
    none: {
      wheelLabel: "No prize",
      title: "No prize",
      description:
        "Too bad! You did not win this time, but you can try again with your next order.",
      winner: false,
    },
    cocktail: {
      wheelLabel: "Free cocktail",
      title: "Free cocktail",
      description:
        "Next time you visit us, you will have a complimentary cocktail.",
      winner: true,
    },
    cocktail_plus_aperitivo: {
      wheelLabel: "Cocktail + aperitif",
      title: "Cocktail + aperitif",
      description:
        "Next time you come with 5 people, your cocktail will be on us and you will also get an aperitif to share.",
      winner: true,
    },
  },
  fr: {
    none: {
      wheelLabel: "Aucun cadeau",
      title: "Aucun cadeau",
      description:
        "Dommage ! Vous n'avez rien gagne cette fois, mais vous pourrez reessayer lors de la prochaine commande.",
      winner: false,
    },
    cocktail: {
      wheelLabel: "Cocktail offert",
      title: "Cocktail offert",
      description:
        "La prochaine fois que vous venez nous voir, vous aurez un cocktail offert.",
      winner: true,
    },
    cocktail_plus_aperitivo: {
      wheelLabel: "Cocktail + aperitif",
      title: "Cocktail + aperitif",
      description:
        "La prochaine fois que vous venez a 5, votre cocktail sera offert ainsi qu'un aperitif a partager.",
      winner: true,
    },
  },
  es: {
    none: {
      wheelLabel: "Sin premio",
      title: "Sin premio",
      description:
        "Que pena! Esta vez no has ganado, pero podras volver a intentarlo en tu proximo pedido.",
      winner: false,
    },
    cocktail: {
      wheelLabel: "Cocktail gratis",
      title: "Cocktail gratis",
      description:
        "La proxima vez que vengas a visitarnos, tendras un cocktail de regalo.",
      winner: true,
    },
    cocktail_plus_aperitivo: {
      wheelLabel: "Cocktail + aperitivo",
      title: "Cocktail + aperitivo",
      description:
        "La proxima vez que vengas con 5 personas, tu cocktail sera invitacion de la casa y tambien tendras un aperitivo para compartir.",
      winner: true,
    },
  },
  de: {
    none: {
      wheelLabel: "Kein Gewinn",
      title: "Kein Gewinn",
      description:
        "Schade! Diesmal hast du nicht gewonnen, aber bei der naechsten Bestellung kannst du es erneut versuchen.",
      winner: false,
    },
    cocktail: {
      wheelLabel: "Cocktail gratis",
      title: "Cocktail gratis",
      description:
        "Bei deinem naechsten Besuch bekommst du einen Cocktail gratis.",
      winner: true,
    },
    cocktail_plus_aperitivo: {
      wheelLabel: "Cocktail + Aperitif",
      title: "Cocktail + Aperitif",
      description:
        "Wenn du das naechste Mal mit 5 Personen kommst, bekommst du deinen Cocktail gratis und dazu einen Aperitif zum Teilen.",
      winner: true,
    },
  },
};

export function getCustomerUiCopy(language: RestaurantLanguageCode) {
  return COPY[language] ?? COPY.it;
}

export function getCustomerPaymentStatusLabel(
  status: string,
  language: RestaurantLanguageCode
) {
  return PAYMENT_STATUS_LABELS[language]?.[status] ?? status;
}

export function getCustomerRequestOptionLabel(
  requestType: StaffRequestOption,
  language: RestaurantLanguageCode
) {
  return STAFF_REQUEST_OPTION_LABELS[language]?.[requestType] ?? requestType;
}

export function getCustomerOrderStatusLabel(
  status: "new" | "preparing" | "ready" | "served",
  language: RestaurantLanguageCode
) {
  return ORDER_STATUS_LABELS[language]?.[status] ?? status;
}

export function getRewardCopy(
  prizeType: RewardPrizeType,
  language: RestaurantLanguageCode
) {
  return REWARD_COPY[language]?.[prizeType] ?? REWARD_COPY.it[prizeType];
}

export function getWaiterRequestCopy(args: {
  language: RestaurantLanguageCode;
  kind: StaffRequestKind | null;
  status: StaffRequestStatus | null;
}) {
  const copy = getCustomerUiCopy(args.language);
  const isPaymentRequest = args.kind === "payment_request";

  if (!args.status) {
    return {
      button: copy.waiterCallIdleButton,
      helper: copy.waiterCallIdleHelp,
      disabled: false,
    };
  }

  if (args.status === "new") {
    return {
      button: isPaymentRequest
        ? copy.waiterCallPaymentRequested
        : copy.waiterCallRequested,
      helper: isPaymentRequest
        ? copy.waiterCallPaymentRequestedHelp
        : copy.waiterCallRequestedHelp,
      disabled: true,
    };
  }

  if (args.status === "in_progress") {
    return {
      button: isPaymentRequest
        ? copy.waiterCallPaymentInProgress
        : copy.waiterCallInProgress,
      helper: isPaymentRequest
        ? copy.waiterCallPaymentInProgressHelp
        : copy.waiterCallInProgressHelp,
      disabled: true,
    };
  }

  return {
    button: copy.waiterCallAgain,
    helper: copy.waiterCallAgainHelp,
    disabled: false,
  };
}
