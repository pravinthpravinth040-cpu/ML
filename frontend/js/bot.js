/**
 * TrustCred AI - Ask TrustCred Instant Local Chatbot
 * File: js/bot.js (<20 KB optimized local intent engine)
 */
(function(){
'use strict';
const USE_LLM=false;
const HELPLINE={teleManas:"14416",supportWhatsapp:"919876543210"};
const TA_DIGITS={'௦':'0','௧':'1','௨':'2','௩':'3','௪':'4','௫':'5','௬':'6','௭':'7','௮':'8','௯':'9'};

function norm(s){
  if(!s)return"";
  return s.toString().replace(/[௦-௯]/g,d=>TA_DIGITS[d]||d).toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’‘।]/g," ").replace(/\s+/g," ").trim();
}

function detectLang(t){
  if(!t)return"en";
  if(/[\u0B80-\u0BFF]/.test(t))return"ta";
  const tg=["enna","eppadi","kammi","koraiv","irukku","kadan","panam","varavu","selavu","evvalavu","solla","sollunga","paaka","mudiyuma","vaanga","thavanai","kasu","yen","naan","thollai","nandri","romba"];
  const ws=norm(t).split(" ");
  return ws.some(w=>tg.includes(w))?"tanglish":"en";
}

function getV(){
  if(window.TrustCred&&typeof window.TrustCred.V==="function")return window.TrustCred.V();
  return typeof V==="function"?V():null;
}
function getCalc(v){
  const s=(window.TrustCred&&window.TrustCred.S)||(typeof S!=="undefined"?S:{amt:30000,mths:12});
  const c=(window.TrustCred&&window.TrustCred.calc)||(typeof calc==="function"?calc:null);
  return(c&&v)?c(v,s.amt||v.loan_amount_requested||30000,s.mths||12):null;
}
function inrF(n){
  if(window.TrustCred&&typeof window.TrustCred.inr==="function")return window.TrustCred.inr(n);
  return"₹"+Math.round(n||0).toLocaleString("en-IN");
}
const D_NOTE={
  en:"\n\n*(Demo score, not a credit score.)*",
  ta:"\n\n*(மாதிரி மதிப்பெண், கடன் மதிப்பெண் அல்ல.)*",
  tanglish:"\n\n*(மாதிரி மதிப்பெண் / Demo score, not a credit score.)*"
};
function pick(l,en,ta,tg){return l==="en"?en:l==="ta"?ta:(tg||(ta+" "+en));}

// 42 INTENTS (6-10 examples in EN, TA, Tanglish)
const INTENTS=[
  {
    id:"score_current",
    examples:["what is my score","check my score","en score enna","en score evvalavu","மதிப்பெண் என்ன","என் மதிப்பெண் என்ன","trust score sollunga","how many points i got","points evvalavu","en score paakanum"],
    keywords:["score","points","mathipen","மதிப்பெண்","trustscore"],
    reply:(v,r,l)=>{
      if(!v||!r)return{text:"Please log in to view score / உள்நுழையவும்."};
      const b=r.sc>=75?["Strong","நிறைவானது"]:r.sc>=55?["Good","நல்லது"]:r.sc>=35?["Fair","சுமாரானது"]:["Low","குறைவு"];
      return{text:pick(l,`Your Trust Score is ${r.sc} out of 100. That is ${b[0]}.${D_NOTE.en}`,`உங்கள் நம்பிக்கை மதிப்பெண் 100-க்கு ${r.sc}. இது ${b[1]} நிலை.${D_NOTE.ta}`,`உங்கள் நம்பிக்கை மதிப்பெண் 100-க்கு ${r.sc} (${b[1]}). Trust Score is ${r.sc}/100.${D_NOTE.tanglish}`)};
    },
    chips:["Why is my score low?","How to improve?","Can I get a loan?"]
  },
  {
    id:"score_why_low",
    examples:["why is my score low","why did my score drop","score yen kammiya irukku","yen koraivaga irukku","மதிப்பெண் ஏன் குறைவு","மதிப்பெண் குறைந்த காரணம்","why low score","score yen kurainjithu","kammi aana reason enna"],
    keywords:["low","drop","kammi","koraiv","குறைவு","yen","kurainjithu"],
    reply:(v,r,l)=>{
      if(!v||!r)return{text:"No vendor data."};
      const w=[...r.f].sort((a,b)=>(a[2]/a[1])-(b[2]/b[1]))[0];
      const fl=v.reciprocal_transfer_share>0;
      const reE=fl?"Money moved back and forth with another vendor.":w[3];
      const reT=fl?"மற்றொரு வியாபாரியுடன் பணம் முன்னும் பின்னும் சுழன்றது.":w[0]==="Steady income"?"விற்பனை சீராக இல்லை.":w[0]==="Low costs"?"செலவு அதிகமாக உள்ளது.":w[0]==="Many customers"?"வாடிக்கையாளர் குறைவு.":"சேமிப்பு தவணையை விடக் குறைவு.";
      return{text:pick(l,`Weakest factor: '${w[0]}'. ${reE}${D_NOTE.en}`,`மதிப்பெண் குறையக் காரணம்: ${reT}${D_NOTE.ta}`,`மதிப்பெண் குறையக் காரணம்: ${reT} Weakest: '${w[0]}'.${D_NOTE.tanglish}`),action:{tab:"home",label:pick(l,"View factors","காரணிகள் காண்க","View details")}};
    },
    chips:["How to improve?","What is transfer warning?","Can I get a loan?"]
  },
  {
    id:"score_why_high",
    examples:["why is my score high","why is score good","score yen nalla irukku","score athigam aana karanam","மதிப்பெண் ஏன் அதிகம்","நல்ல மதிப்பெண் காரணம்","why high score","nalla score yen"],
    keywords:["high","good","athigam","nalla","அதிகம்","நல்லது"],
    reply:(v,r,l)=>{
      if(!v||!r)return{text:"No vendor data."};
      const b=[...r.f].sort((a,b)=>(b[2]/b[1])-(a[2]/a[1]))[0];
      return{text:pick(l,`Strongest factor: '${b[0]}'. ${b[3]}${D_NOTE.en}`,`பலமான அம்சம்: '${b[0]}'. ${b[3]}${D_NOTE.ta}`,`சிறந்த காரணி: '${b[0]}'. ${b[3]}${D_NOTE.tanglish}`)};
    },
    chips:["Can I get a loan?","Cash flow summary","How to improve?"]
  },
  {
    id:"score_factors",
    examples:["what are the 5 factors","how is score calculated","5 vishayam enna","score eppadi poduvanga","5 காரணிகள் என்ன","மதிப்பெண் கணக்கீடு எப்படி","five things checked","score formula"],
    keywords:["factors","5 things","criteria","காரணிகள்","vishayam"],
    reply:(v,r,l)=>({
      text:pick(l,"AI checks 5 things: 1. Steady income (25), 2. Can repay (30), 3. Low costs (15), 4. Many customers (15), 5. Genuine sales (15). Total = 100.","AI 5 விஷயங்களைச் சரிபார்க்கிறது: 1. சீரான வருமானம், 2. திருப்பிச் செலுத்தும் திறன், 3. குறைந்த செலவு, 4. அதிக வாடிக்கையாளர்கள், 5. உண்மையான விற்பனை. மொத்தம் 100.","AI checks 5 things: சீரான வருமானம், திருப்பிச் செலுத்தும் திறன், குறைந்த செலவு, அதிக வாடிக்கையாளர்கள், உண்மையான விற்பனை. Total 100."),
      action:{tab:"ai",label:pick(l,"Understand AI","AI விளக்கம்","Open AI")}
    }),
    chips:["My score","Why is my score low?","How to improve?"]
  },
  {
    id:"improve_general",
    examples:["how to improve score","how do i improve","score eppadi ethurathu","score increase panna enna pannanum","மதிப்பெண்ணை உயர்த்துவது எப்படி","மேம்படுத்தும் வழிகள்","tips to improve","score grow panna"],
    keywords:["improve","increase","tips","ethurathu","உயர்த்த","மேம்படுத்த"],
    reply:(v,r,l)=>({
      text:pick(l,"3 concrete steps: 1. Take UPI from many different customers. 2. Keep daily sales steady each week. 3. Avoid moving money back and forth with other vendors.","3 வழிகள்: 1. பலரிடம் UPI மூலம் வரவு பெறுங்கள். 2. வாரந்தோறும் சீரான விற்பனையை வையுங்கள். 3. பிற வியாபாரிகளுடன் பணத்தைச் சுழற்றாதீர்கள்.","3 tips: 1. Take UPI from many customers. 2. Keep daily sales steady. 3. Other vendors kooda panam sutharatha thavirkavum.")
    }),
    chips:["What is transfer warning?","Can I get a loan?","Cash flow"]
  },
  {
    id:"improve_customers",
    examples:["how to get more customers","customers athigam aakka enna seiyanum","வாடிக்கையாளர்களை அதிகரிக்க","customer count tips","more upi customers","ethana per kaasu tharanum"],
    keywords:["customer","customers","வாடிக்கையாளர்","aட்களை"],
    reply:(v,r,l)=>{
      const u=v?v.unique_customers.toLocaleString("en-IN"):"many";
      return{text:pick(l,`You have ${u} customers. Encourage every buyer to scan your UPI QR code even for small ₹10-₹20 sales.`,`உங்களுக்கு ${u} வாடிக்கையாளர்கள் உள்ளனர். சிறிய தொகைக்கும் QR Code ஸ்கேன் செய்யச் சொல்லுங்கள்.`,`You have ${u} customers. 10-20 roobaakkum QR scan panna sollunga.`)};
    },
    chips:["My score","How to improve?","Why is my score low?"]
  },
  {
    id:"improve_steady",
    examples:["how to keep sales steady","sales steady panna enna seiyanum","விற்பனையை சீராக்க","steady income tips","daily sales fluctuation","seeraana varumanam"],
    keywords:["steady","fluctuation","seerana","சீராக"],
    reply:(v,r,l)=>({
      text:pick(l,"Maintain consistent business days each week without unnotified breaks so your cash flow is reliable.","வாரத்தின் எல்லா நாட்களிலும் சீரான விற்பனையைத் தொடருங்கள்; நீண்ட இடைவெளிகளைத் தவிர்க்கவும்.","Weekly consistent sales maintain pannunga, long breaks edukkaadheenga.")
    }),
    chips:["How to improve?","My score","Cash flow"]
  },
  {
    id:"improve_costs",
    examples:["how to reduce costs","selavu eppadi kuraikkarathu","செலவைக் குறைக்க","cut expenses","expense control tips","selavu athigam"],
    keywords:["cost","costs","expense","expenses","selavu","செலவு"],
    reply:(v,r,l)=>{
      const er=v?((v.total_expenses/v.total_receipts)*100).toFixed(0):"40";
      return{text:pick(l,`Expenses are ${er}% of sales. Keeping business expenses under 30% boosts your savings score.`,`செலவு விற்பனையில் ${er}% ஆக உள்ளது. இதை 30%-க்குள் கட்டுப்படுத்தினால் மதிப்பெண் உயரும்.`,`Expenses ${er}% of sales. 30%-kulla control panna score erum.`)};
    },
    chips:["Money kept","Can I get a loan?","How to improve?"]
  },
  {
    id:"money_in",
    examples:["how much money came in","total receipts","money in","en varavu evvalavu","வரவு எவ்வளவு","மொத்த வரவு","collection evvalavu","total collection"],
    keywords:["money in","receipts","varavu","collection","வரவு"],
    reply:(v,r,l)=>{
      if(!v)return{text:"No data."};
      return{text:pick(l,`Total money in over 3 months is ${inrF(v.total_receipts)}.`,`3 மாதங்களில் மொத்த வரவு ${inrF(v.total_receipts)}.`,`Total money in is ${inrF(v.total_receipts)} (3 months).`)};
    },
    chips:["Money out","Money kept","My score"]
  },
  {
    id:"money_out",
    examples:["how much money went out","total expenses","money out","en selavu evvalavu","செலவு எவ்வளவு","மொத்த செலவு","how much spent","expense total"],
    keywords:["money out","expenses","selavu","செலவு","spent"],
    reply:(v,r,l)=>{
      if(!v)return{text:"No data."};
      return{text:pick(l,`Total money out over 3 months is ${inrF(v.total_expenses)}.`,`3 மாதங்களில் மொத்த செலவு ${inrF(v.total_expenses)}.`,`Total money out is ${inrF(v.total_expenses)} (3 months).`)};
    },
    chips:["Money in","Money kept","Can I get a loan?"]
  },
  {
    id:"money_net",
    examples:["how much did i keep","net cashflow","money kept","en micham evvalavu","மிச்சம் எவ்வளவு","கையில் நின்ற பணம்","savings total","savings evvalavu"],
    keywords:["kept","net","savings","micham","மிச்சம்","cashflow"],
    reply:(v,r,l)=>{
      if(!v)return{text:"No data."};
      return{text:pick(l,`You kept ${inrF(v.net_cashflow)} in savings over 3 months (${inrF(v.net_cashflow/3)}/month).`,`3 மாதங்களில் உங்கள் நிகர மிச்சம் ${inrF(v.net_cashflow)} (மாதத்திற்கு ${inrF(v.net_cashflow/3)}).`,`You kept ${inrF(v.net_cashflow)} in savings (${inrF(v.net_cashflow/3)}/month).`)};
    },
    chips:["Can I get a loan?","What is my EMI?","My score"]
  },
  {
    id:"money_summary",
    examples:["cash flow summary","varavu selavu summary","பணப்புழக்கம் விவரம்","give me full summary","money details","panappuzhakkam sollunga","overview of business"],
    keywords:["summary","overview","panappuzhakkam","பணப்புழக்கம்","varavu selavu"],
    reply:(v,r,l)=>{
      if(!v)return{text:"No data."};
      return{text:pick(l,`In 3 months: Money in ${inrF(v.total_receipts)}, Money out ${inrF(v.total_expenses)}, You kept ${inrF(v.net_cashflow)}.`,`3 மாதங்களில்: வரவு ${inrF(v.total_receipts)}, செலவு ${inrF(v.total_expenses)}, மிச்சம் ${inrF(v.net_cashflow)}.`,`Money in ${inrF(v.total_receipts)}, out ${inrF(v.total_expenses)}, kept ${inrF(v.net_cashflow)}.`),action:{tab:"cf",label:pick(l,"Open Cash Flow","பணப்புழக்கம் பகுதி","Open Cashflow")}};
    },
    chips:["Best month","Can I get a loan?","My score"]
  },
  {
    id:"customers_count",
    examples:["how many customers paid me","customer count","ethana per kaasu kuduthanga","எத்தனை வாடிக்கையாளர்கள்","வாடிக்கையாளர் எண்ணிக்கை","unique customers","people count"],
    keywords:["customer count","customers paid","ethana per","எத்தனை வாடிக்கையாளர்"],
    reply:(v,r,l)=>{
      if(!v)return{text:"No data."};
      return{text:pick(l,`${v.unique_customers.toLocaleString("en-IN")} different customers paid you via UPI in 3 months.`,`3 மாதங்களில் ${v.unique_customers.toLocaleString("en-IN")} வெவ்வேறு வாடிக்கையாளர்கள் UPI மூலம் பணம் செலுத்தினர்.`,`${v.unique_customers.toLocaleString("en-IN")} customers paid you via UPI.`)};
    },
    chips:["How many payments?","Money in","My score"]
  },
  {
    id:"txn_count",
    examples:["how many payments did i get","total transactions","ethana payment vanthuchu","எத்தனை பரிவர்த்தனைகள்","எத்தனை முறை பணம் வந்தது","payment count","upi transactions"],
    keywords:["transactions","payments received","payment count","பரிவர்த்தனை"],
    reply:(v,r,l)=>{
      if(!v)return{text:"No data."};
      return{text:pick(l,`You received ${v.txn_count.toLocaleString("en-IN")} customer payments via UPI in 3 months.`,`3 மாதங்களில் மொத்தம் ${v.txn_count.toLocaleString("en-IN")} முறை வாடிக்கையாளர் UPI வரவுகள் வந்துள்ளன.`,`Received ${v.txn_count.toLocaleString("en-IN")} payments via UPI.`)};
    },
    chips:["Customers count","Best month","My score"]
  },
  {
    id:"best_month",
    examples:["which was my best month","highest sales month","entha maasam nalla sales","எந்த மாதம் அதிக விற்பனை","சிறந்த மாதம் எது","top month sales","maximum receipts month"],
    keywords:["best month","highest sales","entha maasam","சிறந்த மாதம்"],
    reply:(v,r,l)=>{
      if(!v||!v.monthly_receipts)return{text:"No data."};
      const ms=Object.keys(v.monthly_receipts);let b=ms[0];
      ms.forEach(m=>{if(v.monthly_receipts[m]>v.monthly_receipts[b])b=m;});
      const mn=b==="2026-07"?["July","ஜூலை"]:b==="2026-08"?["August","ஆகஸ்ட்"]:["September","செப்டம்பர்"];
      return{text:pick(l,`Highest sales month was ${mn[0]} with ${inrF(v.monthly_receipts[b])} in receipts.`,`அதிக விற்பனை மாதம் ${mn[1]}; வரவு ${inrF(v.monthly_receipts[b])}.`,`Best sales month was ${mn[0]} (${inrF(v.monthly_receipts[b])}).`)};
    },
    chips:["Cash flow summary","Can I get a loan?","My score"]
  },
  {
    id:"loan_eligibility",
    examples:["can i get a loan","am i eligible for loan","kadan kidaikkuma","kadan vaanga mudiyuma","en loan eppadi","loan eppadi irukku","எனக்கு கடன் கிடைக்குமா","கடன் தகுதி உண்டா","loan chance irukka","will i get loan"],
    keywords:["eligible","eligibility","kadan kidaikkuma","கடன் கிடைக்குமா","can i get loan","loan eppadi","en loan"],
    reply:(v,r,l)=>{
      if(!v||!r)return{text:"No data."};
      const vd=r.cover>=1.5?["Monthly savings cover requested EMI.","மாத மிச்சம் தவணையை ஈடுசெய்கிறது."]:["Cash flow is tight for this amount.","பணப்புழக்கம் சற்று நெருக்கடியாக உள்ளது."];
      return{text:pick(l,`${vd[0]} TrustCred provides cash-flow proof; the lender decides loan approval.${D_NOTE.en}`,`${vd[1]} டிரஸ்ட்கிரெட் சான்றை மட்டுமே காட்டுகிறது; கடன் முடிவை நிதி நிறுவனமே எடுக்கும்.${D_NOTE.ta}`,`${vd[1]} TrustCred provides proof; lender decides approval.${D_NOTE.tanglish}`),action:{tab:"loan",label:pick(l,"Loan Simulator","கடன் கணிப்பான்","Check Loan")}};
    },
    chips:["What is my EMI?","Change loan terms","Why is my score low?"]
  },
  {
    id:"loan_emi",
    examples:["what is my emi","monthly instalment","matha thavanai evvalavu","emi evvalavu","மாதத் தவணை எவ்வளவு","மாதம் எவ்வளவு கட்ட வேண்டும்","how much emi to pay","repayment per month"],
    keywords:["emi","instalment","thavanai","மாதத் தவணை","மாதம் கட்ட"],
    reply:(v,r,l)=>{
      if(!v||!r)return{text:"No data."};
      const s=(window.TrustCred&&window.TrustCred.S)||{amt:v.loan_amount_requested,mths:12};
      return{text:pick(l,`For a ${inrF(s.amt)} loan over ${s.mths} months, estimated EMI is ${inrF(r.emi)}/month (flat 20% p.a. illustrative).`,`${inrF(s.amt)} கடனுக்கு (${s.mths} மாதங்கள்), உத்தேச மாதத் தவணை ${inrF(r.emi)} (ஆண்டுக்கு 20% மாதிரி வட்டி).`,`For ${inrF(s.amt)} loan (${s.mths} mths), EMI is ${inrF(r.emi)}/month.`),action:{tab:"loan",label:pick(l,"Adjust Loan","தவணையை மாற்ற","Adjust Loan")}};
    },
    chips:["Can my savings cover EMI?","Change loan terms","My score"]
  },
  {
    id:"loan_cover",
    examples:["can my savings cover emi","does my savings cover it","en micham emi kattu ma","என் சேமிப்பு தவணையை ஈடுசெய்யுமா","தவணை கட்ட முடியுமா","can i afford emi"],
    keywords:["cover","savings cover","micham emi","ஈடுசெய்யுமா"],
    reply:(v,r,l)=>{
      if(!v||!r)return{text:"No data."};
      const c=r.cover.toFixed(1);
      return{text:pick(l,`Your monthly savings (${inrF(r.mNet)}) cover your ${inrF(r.emi)} EMI by ${c}x.`,`மாத மிச்சம் (${inrF(r.mNet)}), தவணை ${inrF(r.emi)}-ஐ விட ${c} மடங்கு உள்ளது.`,`Savings (${inrF(r.mNet)}) cover ${inrF(r.emi)} EMI by ${c}x.`)};
    },
    chips:["What is my EMI?","Can I get a loan?","How to improve?"]
  },
  {
    id:"loan_change_terms",
    examples:["change loan amount or months","how to change tenure","loan amount mathanum","months increase panna","கடன் தொகையை மாற்ற","மாதங்களை மாற்ற","modify loan amount","adjust loan emi"],
    keywords:["change loan","tenure","months increase","mathanum","மாற்ற"],
    reply:(v,r,l)=>({
      text:pick(l,"Adjust requested loan amount (₹10k to ₹100k) and tenure (6 to 24 months) on the Loan tab.","கடன் தொகையையும் (₹10k-₹100k), மாதங்களையும் (6-24) 'கடன்' பகுதியில் மாற்றிக்கொள்ளலாம்.","Loan tab-la amount (₹10k-₹100k) and months (6-24) maathikkalaam."),
      action:{tab:"loan",label:pick(l,"Open Loan tab","கடன் பகுதி","Open Loan")}
    }),
    chips:["What is my EMI?","Can I get a loan?","My score"]
  },
  {
    id:"out_of_scope_approval",
    examples:["did bank approve my loan","loan sanction aaiducha","kadan confirm aacha","sanction status","கடன் ஒப்புதல் ஆச்சா","கடன் எப்போது கிடைக்கும்","when will i get money in bank","loan approved or rejected"],
    keywords:["sanction","approved","confirm aacha","ஒப்புதல்","reject"],
    reply:(v,r,l)=>({
      text:pick(l,"TrustCred does not approve or reject loans; we only provide cash-flow proof. Contact your lender for sanction status.","டிரஸ்ட்கிரெட் கடன் ஒப்புதல் அளிப்பதோ நிராகரிப்பதோ இல்லை; சான்றை மட்டுமே தருகிறோம். கடன் நிறுவனத்தைத் தொடர்பு கொள்ளவும்.","TrustCred loan approve/reject pannaadhu. Lender kitta direct-aa kekkavum.")
    }),
    chips:["Can I get a loan?","What is my EMI?","Talk to a person"]
  },
  {
    id:"out_of_scope_interest",
    examples:["what is bank interest rate","which bank gives low interest","vatti evvalavu poduvanga","வட்டி விகிதம் என்ன","குறைந்த வட்டி எங்கு கிடைக்கும்","bank interest quote","cheapest interest rate"],
    keywords:["interest rate","vatti","வட்டி","rate of interest"],
    reply:(v,r,l)=>({
      text:pick(l,"Interest rates are set by the lender. The 20% in the app simulator is purely for illustration.","வட்டி விகிதத்தை கடன் வழங்கும் நிறுவனங்களே தீர்மானிக்கின்றன. செயலியில் உள்ள 20% மாதிரி கணக்கீடு மட்டுமே.","Interest rate lender mudivu pannuvaanga; app-la 20% sample thaan.")
    }),
    chips:["What is my EMI?","Can I get a loan?","How the AI works"]
  },
  {
    id:"warning_circular",
    examples:["what is circular transfer warning","transfer warning enna","warning yen vanthuchu","money moving between vendors","பரிமாற்ற எச்சரிக்கை என்ன","வியாபாரிகளிடையே பணம் சுழல்வது","reciprocal transfer warning","why red alert"],
    keywords:["warning","circular","reciprocal","transfer warning","எச்சரிக்கை","பரிமாற்ற"],
    reply:(v,r,l)=>{
      const fl=v&&v.reciprocal_transfer_share>0;
      if(fl){
        return{text:pick(l,"Money moved back and forth with another vendor. This is not genuine sales and caps your Trust Score at 40 points.","மற்றொரு வியாபாரியுடன் பணம் முன்னும் பின்னும் சுழன்றதால் இது உண்மையான விற்பனை அல்ல; மதிப்பெண் 40-க்கு மேல் போகாது.","Money moved between vendors. Real sales illaathathaal score 40-kku mela pogadhu.")};
      }
      return{text:pick(l,"Good news: No circular transfers detected. Your transactions are genuine!","நல்ல செய்தி: போலி பணப் பரிமாற்றம் எதுவும் இல்லை; விற்பனை உண்மையானது!","No circular transfers detected; sales genuine-aa irukku!")};
    },
    chips:["How to fix warning?","My score","Why is my score low?"]
  },
  {
    id:"warning_fix",
    examples:["how to remove warning","warning eppadi edukkarathu","warning pooga enna seiyanum","how to fix fake sales","எச்சரிக்கையை நீக்குவது எப்படி","சுழற்சி பரிவர்த்தனையை தவிர்க்க","clear red alert","stop transfer warning"],
    keywords:["fix warning","remove warning","warning edukkarathu","எச்சரிக்கையை நீக்க"],
    reply:(v,r,l)=>({
      text:pick(l,"Stop moving money back and forth with other shopkeepers. Collect UPI only from genuine retail buyers.","பிற கடைக்காரர்களுடன் பணம் மாற்றுவதை நிறுத்திவிட்டு, நேரடி வாடிக்கையாளர்களிடம் மட்டும் UPI வரவு பெறுங்கள்.","Other shopkeepers kooda transfer stop pannunga; direct customers kitta mattum UPI vaangunga.")
    }),
    chips:["What is transfer warning?","How to improve?","My score"]
  },
  {
    id:"ai_how_it_works",
    examples:["how does the ai work","ai eppadi vela seiyuthu","ai explanation","understand ai","AI எப்படி செயல்படுகிறது","செயற்கை நுண்ணறிவு விளக்கம்","how ai scores me","algorithm explanation"],
    keywords:["ai work","how ai","ai eppadi","AI எப்படி","understand ai"],
    reply:(v,r,l)=>({
      text:pick(l,"TrustCred AI reads customer UPI payments directly from your phone and scores 5 factors transparently out of 100.","டிரஸ்ட்கிரெட் AI உங்கள் UPI வரவுகளைப் பார்த்து 5 காரணிகளின் அடிப்படையில் 100-க்கு மதிப்பெண் வழங்குகிறது.","TrustCred AI phone UPI receipts paathu 5 factors moolam 100-kku score podudhu."),
      action:{tab:"ai",label:pick(l,"Open Understand AI","AI விளக்கம்","Open AI")}
    }),
    chips:["What AI does not do","5 factors","Is my data safe?"]
  },
  {
    id:"ai_human_decision",
    examples:["does ai make loan decision alone","ai mattum thaan mudivedukkuma","who makes final decision","AI மட்டும் முடிவெடுக்குமா","மனிதர் முடிவெடுப்பாரா","does bot decide loan","who sanctions loan"],
    keywords:["alone","final decision","human","manithar","மனிதர்","mudivedukkuma"],
    reply:(v,r,l)=>({
      text:pick(l,"No. The AI never decides alone. The score is a guide; a human underwriter at the lender makes the final decision.","இல்லை! AI தனியாக முடிவெடுக்காது. மதிப்பெண் ஒரு வழிகாட்டி மட்டுமே; கடன் நிறுவன மனிதரே இறுதி முடிவெடுப்பார்.","No, AI mattum mudivu pannadhu; lender-oda human officer thaan final decision edukkaaru.")
    }),
    chips:["How the AI works","Can I get a loan?","My score"]
  },
  {
    id:"ai_limitations",
    examples:["what does ai not do","ai enna pannaathu","AI எதைச் செய்யாது","does ai read my sms","does ai track my gps","ai limitations","what ai cannot do"],
    keywords:["not do","limitations","pannaathu","செய்யாது","sms read","track gps"],
    reply:(v,r,l)=>({
      text:pick(l,"AI does NOT read private SMS, does NOT track GPS, does NOT decide loans alone, and does NOT predict if you will repay.","AI தனிப்பட்ட SMS படிக்காது, GPS பார்க்காது, தனியாகக் கடன் முடிவெடுக்காது, திருப்பிச் செலுத்துவீர்களா என ஊகிக்காது.","AI private SMS padikkaadhu, GPS paakkaadhu, alone-aa decision edukkaadhu.")
    }),
    chips:["Is my data safe?","How the AI works","Who can see my data?"]
  },
  {
    id:"data_safety",
    examples:["is my data safe","en data safe aa","என் தகவல் பாதுகாப்பானதா","privacy policy","is my information secure","data thiruduvangala","security check","safety of upi"],
    keywords:["safe","privacy","secure","பாதுகாப்பானதா","thiruduvangala"],
    reply:(v,r,l)=>({
      text:pick(l,"Yes, your data is 100% encrypted on your device. You choose what lenders see and can stop sharing anytime.","ஆம், உங்கள் தகவல்கள் முழுப் பாதுகாப்புடன் உள்ளன. பகிர்வை நீங்களே எப்போது வேண்டுமானாலும் நிறுத்தலாம்.","Yes, 100% safe. Lender enna paakanum nu neengale choose pannalaam."),
      action:{tab:"me",label:pick(l,"Me Tab","நான் பகுதி","Open Me Tab")}
    }),
    chips:["Who can see my data?","How to stop sharing?","What is TrustCred?"]
  },
  {
    id:"data_who_sees",
    examples:["who can see my data","en data yaaru paapanga","என் தகவலை யார் பார்ப்பார்கள்","who has access","can bank see my details","yaravathu data paapangala","who sees transactions"],
    keywords:["who can see","yaaru paapanga","யார் பார்ப்பார்","access"],
    reply:(v,r,l)=>({
      text:pick(l,"Only verified lenders you explicitly choose to share with can see your report. No other vendors can see it.","நீங்கள் அனுமதிக்கும் பதிவுசெய்த கடன் நிறுவனங்கள் மட்டுமே பார்க்க முடியும். பிற வியாபாரிகள் பார்க்க முடியாது.","Only unga verified lenders mattum paapanga; other vendors paakka mudiyaadhu.")
    }),
    chips:["How to stop sharing?","Is my data safe?","My score"]
  },
  {
    id:"data_stop_sharing",
    examples:["how to stop sharing data","data share panna koodathu","பகிர்வை நிறுத்துவது எப்படி","stop sharing","revoke lender access","share thadukka","cancel sharing"],
    keywords:["stop sharing","revoke","share panna koodathu","நிறுத்துவது"],
    reply:(v,r,l)=>({
      text:pick(l,"Go to the 'Me' tab and tap 'Stop sharing everything' to revoke access immediately.","'நான்' (Me) பகுதிக்குச் சென்று 'எல்லா பகிர்வையும் நிறுத்து' பட்டனைத் தொடுங்கள்.","'Me' tab-la 'Stop sharing everything' click panni revoke pannalaam."),
      action:{tab:"me",label:pick(l,"Go to Me Tab","நான் பகுதி","Open Me Tab")}
    }),
    chips:["Is my data safe?","Who can see my data?","My score"]
  },
  {
    id:"what_is_trustcred",
    examples:["what is trustcred","trustcred enna","டிரஸ்ட்கிரெட் என்றால் என்ன","about trustcred","intha app enna","who made trustcred","app use enna","what does app do"],
    keywords:["what is trustcred","about trustcred","trustcred enna","டிரஸ்ட்கிரெட் என்றால் என்ன"],
    reply:(v,r,l)=>({
      text:pick(l,"TrustCred is a financial health tool for micro-merchants, turning daily UPI sales into credible cash-flow proof.","டிரஸ்ட்கிரெட் சிறு வியாபாரிகளின் தினசரி UPI வரவுகளை நியாயமான கடன் சான்றாக மாற்றும் செயலி.","TrustCred unga daily UPI sales-ah cash-flow proof-aa mathi loan vaanga udhavum tool.")
    }),
    chips:["Is TrustCred free?","Do I need a bank account?","My score"]
  },
  {
    id:"trustcred_free",
    examples:["is trustcred free","intha app free ya","இந்த செயலி இலவசமா","do i have to pay","charge irukka","fees evvalavu","free app aa","any hidden charges"],
    keywords:["free","charge","fees","kaasu kudukanuma","இலவசமா"],
    reply:(v,r,l)=>({
      text:pick(l,"Yes! TrustCred is completely free for street vendors and small merchants. No hidden fees.","ஆம்! சிறு வியாபாரிகளுக்கு டிரஸ்ட்கிரெட் செயலி முற்றிலும் இலவசம்; கட்டணம் எதுவும் இல்லை.","Yes, TrustCred vendors-kku 100% free app; charges edhuvum illa.")
    }),
    chips:["What is TrustCred?","Do I need a bank account?","Can I get a loan?"]
  },
  {
    id:"need_bank_account",
    examples:["do i need a bank account","bank passbook thevaya","வங்கி கணக்கு தேவையா","need bank history","need credit card","bank statement illaye","cibil record illa","no collateral"],
    keywords:["bank account","passbook","statement","credit card","வங்கி கணக்கு"],
    reply:(v,r,l)=>({
      text:pick(l,"No bank statements or credit cards needed! The app only looks at customer UPI payments on your phone.","வங்கிப் பாஸ்புக்கோ, ஸ்டேட்மெண்ட்டோ தேவையில்லை! போனில் வரும் தினசரி UPI வரவுகளே போதுமானது.","Bank passbook/statement theva illa; unga phone-la vara UPI receipts pothum.")
    }),
    chips:["Does it affect CIBIL?","What is TrustCred?","My score"]
  },
  {
    id:"cibil_impact",
    examples:["does this affect my cibil score","cibil score paathikkuma","சிபில் மதிப்பெண் குறையுமா","cibil check aaguma","is it credit score","cibil inquiry aaguma","cibil impact"],
    keywords:["cibil","credit score","சிபில்","cibil score"],
    reply:(v,r,l)=>({
      text:pick(l,"No. TrustCred NEVER affects your CIBIL score. It is an independent cash-flow proof tool.","இல்லை! டிரஸ்ட்கிரெட் மதிப்பெண்ணால் சிபில் (CIBIL) பாதிக்கப்படாது; இது கடன் பணியக விசாரணை அல்ல.","No, CIBIL paathikkaadhu; idhu independent cash-flow tool.")
    }),
    chips:["What is TrustCred?","My score","Can I get a loan?"]
  },
  {
    id:"change_lang_ta",
    examples:["tamil please","tamil la pesunga","தமிழில் பேசு","speak in tamil","change language to tamil","tamil maathu","tamilil sollunga"],
    keywords:["tamil please","tamil la","தமிழில்","tamil maathu"],
    reply:(v,r,l)=>{
      if(window.TrustCred&&window.TrustCred.S){
        window.TrustCred.S.lang="ta";
        try{localStorage.setItem("lang","ta");}catch(e){}
        if(typeof window.TrustCred.render==="function")window.TrustCred.render();
      }
      return{text:"செயலி மற்றும் உரையாடல் தமிழுக்கு மாற்றப்பட்டது! உங்களுக்கு என்ன உதவி வேண்டும்?"};
    },
    chips:["என் மதிப்பெண் என்ன?","கடன் கிடைக்குமா?","மேம்படுத்தும் வழிகள்"]
  },
  {
    id:"change_lang_en",
    examples:["english please","switch to english","ஆங்கிலத்தில் பேசு","speak in english","change to english","english language","english mathu"],
    keywords:["english please","switch to english","ஆங்கிலத்தில்","speak english"],
    reply:(v,r,l)=>{
      if(window.TrustCred&&window.TrustCred.S){
        window.TrustCred.S.lang="en";
        try{localStorage.setItem("lang","en");}catch(e){}
        if(typeof window.TrustCred.render==="function")window.TrustCred.render();
      }
      return{text:"Language switched to English! How can I assist you with your Trust Score today?"};
    },
    chips:["My score","Can I get a loan?","How to improve?"]
  },
  {
    id:"speak_answer",
    examples:["speak it","read aloud","pesi kaattu","படித்துக் காட்டு","voice a sollu","read out loud","listen to this","kekkura maathiri sollu"],
    keywords:["speak","read aloud","pesi kaattu","படித்துக் காட்டு","voice"],
    reply:(v,r,l)=>{
      setTimeout(()=>{if(window.TrustCredBot)window.TrustCredBot.speakLastMessage();},120);
      return{text:pick(l,"Reading the answer aloud now... 🔊","பதிலை இப்போது வாசிக்கிறேன்... 🔊","Voice-la read panren... 🔊")};
    },
    chips:["My score","Can I get a loan?","How to improve?"]
  },
  {
    id:"greeting",
    examples:["hello","hi","vanakkam","வணக்கம்","namaste","good morning","hey trustcred","halo","hi pa"],
    keywords:["hello","hi","vanakkam","வணக்கம்","namaste","good morning"],
    reply:(v,r,l)=>{
      const id=v?v.vendor_id:"";
      return{text:pick(l,`Hello ${id}! I am Ask TrustCred. Ask me about your Trust Score, daily sales, or loan readiness.`,`வணக்கம் ${id}! நான் டிரஸ்ட்கிரெட் உதவியாளர். மதிப்பெண் அல்லது கடன் பற்றி எதையும் கேட்கலாம்.`,`Vanakkam ${id}! Ask TrustCred here. Score, cash flow, loan pathi ethuvum kelunga.`)};
    },
    chips:["My score","Why is my score low?","Can I get a loan?"]
  },
  {
    id:"thanks",
    examples:["thank you","thanks","romba nandri","நன்றி","super thanks","thanks pa","mikavum nandri","thank u"],
    keywords:["thank","thanks","nandri","நன்றி","romba nandri"],
    reply:(v,r,l)=>({
      text:pick(l,"You're welcome! Collect customer UPI receipts and grow your business with confidence.","மிக்க மகிழ்ச்சி! தொடர்ந்து UPI வரவு பெற்று உங்கள் வியாபாரத்தை நம்பிக்கையுடன் வளருங்கள்.","Welcome pa! UPI receipts collect panni business-ah grow pannunga.")
    }),
    chips:["My score","Can I get a loan?","How to improve?"]
  },
  {
    id:"goodbye",
    examples:["bye","goodbye","poyitu varen","போய் வருகிறேன்","see you later","mudinjathu bye","tata","bye pa"],
    keywords:["bye","goodbye","poyitu varen","போய் வருகிறேன்","tata"],
    reply:(v,r,l)=>({
      text:pick(l,"Goodbye! Wishing you brisk business today. Tap 💬 anytime you need help.","வணக்கம், போய் வாருங்கள்! வியாபாரம் சிறக்க வாழ்த்துகள். உதவிக்கு 💬 தட்டவும்.","Bye pa! Nalla business aaga vaazhthukkal. Doubt irundha 💬 tap pannunga.")
    }),
    chips:["My score","Can I get a loan?"]
  },
  {
    id:"smalltalk_bot",
    examples:["who are you","nee yaaru","நீ யார்","what is your name","robot aa","unga peru enna","bot aa nee"],
    keywords:["who are you","nee yaaru","நீ யார்","your name"],
    reply:(v,r,l)=>({
      text:pick(l,"I am 'Ask TrustCred', your on-device AI assistant answering questions instantly without internet delays.","நான் 'டிரஸ்ட்கிரெட் உதவியாளர்'. உங்கள் போனிலேயே இயங்கி எளிய தமிழில் உடனுக்குடன் பதில் தருகிறேன்.","Naan 'Ask TrustCred' AI bot, phone-laye fast-aa unga score-ah explain panren.")
    }),
    chips:["My score","How the AI works","Is my data safe?"]
  },
  {
    id:"distress_financial",
    examples:["threatened by moneylenders","kadan thollai","blade vatti bayam","suicide thoughts","cannot repay loan trouble","kadan kaaran thitturan","கடன் தொல்லை","தற்கொலை பயம்"],
    keywords:["moneylender","blade vatti","suicide","kadan thollai","chavu","maranam","threatened","harass","chaga poren","bayama irukku","கடன் தொல்லை","தற்கொலை"],
    reply:(v,r,l)=>({
      text:pick(l,`Your safety matters. Please do not face this alone.\n\nFree 24/7 Support:\n• Tele-MANAS: ${HELPLINE.teleManas}\n• WhatsApp: +${HELPLINE.supportWhatsapp}`,`உங்கள் பாதுகாப்பே முக்கியம். தனியாகத் தவிக்க வேண்டாம்.\n\nஇலவச 24/7 உதவி எண்:\n• டெலி-மானாஸ்: ${HELPLINE.teleManas}\n• வாட்ஸ்அப்: +${HELPLINE.supportWhatsapp}`,`Unga safety mukkiyam. Thaniya kavalai padaadheenga.\n\nFree Help:\n• Tele-MANAS: ${HELPLINE.teleManas}\n• WhatsApp: +${HELPLINE.supportWhatsapp}`),
      action:{external:`tel:${HELPLINE.teleManas}`,label:`📞 Call ${HELPLINE.teleManas}`}
    }),
    chips:["Talk to a person","Is my data safe?","My score"]
  },
  {
    id:"talk_to_person",
    examples:["talk to a person","human agent","manushan kitta pesanum","மனிதரிடம் பேச வேண்டும்","customer care number","call support","whatsapp support","contact person"],
    keywords:["person","human","manushan","மனிதர்","agent","support","whatsapp"],
    reply:(v,r,l)=>({
      text:pick(l,"You can chat directly with our vendor support officer via WhatsApp:","எங்கள் ஆதரவுக் குழுவினருடன் நேரடியாகப் பேச வாட்ஸ்அப் இணைப்பைப் பயன்படுத்தவும்:","Direct support agent kooda WhatsApp-la chat panna click pannunga:"),
      action:{external:`https://wa.me/${HELPLINE.supportWhatsapp}?text=Hello%20TrustCred%20Support`,label:"💬 WhatsApp Support"}
    }),
    chips:["My score","Can I get a loan?","How to improve?"]
  }
];

// MATCHING ENGINE
function scoreIntent(inN,it){
  let b=0;const iWs=new Set(inN.split(" "));
  for(const ex of it.examples){
    const exN=norm(ex);
    if(inN===exN)return 1.0;
    if(inN.includes(exN)||exN.includes(inN))b=Math.max(b,0.85);
    const eWs=new Set(exN.split(" "));let inter=0;
    for(const w of iWs)if(eWs.has(w))inter++;
    const union=new Set([...iWs,...eWs]).size;
    if(union>0)b=Math.max(b,(inter/union)*0.9);
  }
  if(it.keywords){
    let kwM=0;
    for(const kw of it.keywords){
      if(inN.includes(norm(kw)))kwM++;
    }
    if(kwM>0)b=Math.max(b,Math.min(0.5+kwM*0.25,0.95));
  }
  return b;
}

function matchIntent(raw){
  const n=norm(raw);if(!n)return null;
  const dist=INTENTS.find(i=>i.id==="distress_financial");
  if(dist&&dist.keywords.some(k=>n.includes(norm(k))))return{type:"single",intent:dist,score:1};

  const sc=INTENTS.map(i=>({intent:i,score:scoreIntent(n,i)})).sort((a,b)=>b.score-a.score);
  const t1=sc[0],t2=sc[1];
  if(t1.score>=0.45){
    if(t2&&t2.score>=0.40&&(t1.score-t2.score)<0.10&&t1.intent.id!==t2.intent.id){
      return{type:"clarify",intents:[t1.intent,t2.intent],score:t1.score};
    }
    return{type:"single",intent:t1.intent,score:t1.score};
  }
  return{type:"fallback",candidates:sc.slice(0,4).map(s=>s.intent),score:t1.score};
}

// LLM SMART FALLBACK
async function callLlm(q,v,r){
  if(!USE_LLM)return null;
  const ac=new AbortController(),to=setTimeout(()=>ac.abort(),6000);
  try{
    const res=await fetch("/api/chat",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({question:q,vendor_summary:{vendor_id:v.vendor_id,score:r.sc,receipts:v.total_receipts,expenses:v.total_expenses,net:v.net_cashflow}}),
      signal:ac.signal
    });
    clearTimeout(to);
    return res.ok?(await res.json()).reply||null:null;
  }catch(e){clearTimeout(to);return null;}
}

// TTS & VOICE
let speechRec=null;
function initVoice(onRes,onSt){
  const SA=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SA)return null;
  const r=new SA();r.continuous=false;r.interimResults=false;
  r.onstart=()=>onSt(true);r.onend=()=>onSt(false);r.onerror=()=>onSt(false);
  r.onresult=e=>onRes(e.results[0][0].transcript);
  return r;
}
function speak(txt,lang){
  if(!window.speechSynthesis)return;
  window.speechSynthesis.cancel();
  let cl=txt.replace(/<[^>]+>/g," ").replace(/\*/g,"");
  if(lang==="ta"){cl=cl.replace(/₹\s*([0-9,]+)/g,"$1 ரூபாய் ").replace(/₹/g,"ரூபாய் ");}
  else{cl=cl.replace(/₹\s*([0-9,]+)/g,"$1 rupees ").replace(/₹/g,"rupees ");}
  const u=new SpeechSynthesisUtterance(cl);
  u.lang=lang==="ta"?"ta-IN":"en-IN";
  const vs=window.speechSynthesis.getVoices()||[];
  let vc=lang==="ta"?vs.find(v=>v.lang==="ta-IN"||v.lang==="ta_IN"||(v.lang&&v.lang.toLowerCase().startsWith("ta"))):vs.find(v=>v.lang==="en-IN"||(v.lang&&v.lang.toLowerCase().startsWith("en")));
  if(lang==="ta"&&!vc){
    alert("Tamil voice is not installed. Open Settings > Language > Text-to-speech to install it. / உங்கள் மொபைலில் தமிழ் குரல் வசதி இல்லை. Settings > Language > Text-to-speech பகுதிக்குச் சென்று தமிழ் குரலை நிறுவவும்.");
    return;
  }
  if(vc)u.voice=vc;
  window.speechSynthesis.speak(u);
}

// UI LOGIC
let chatHistory=[],isSheetOpen=false,isListening=false,lastSpk="",lastLng="en";
const STARTER_CHIPS=[
  {e:"My score",t:"என் மதிப்பெண்",q:"My score"},
  {e:"Why is my score low?",t:"மதிப்பெண் ஏன் குறைவு?",q:"Why is my score low"},
  {e:"Can I get a loan?",t:"கடன் கிடைக்குமா?",q:"Can I get a loan"},
  {e:"How do I improve?",t:"மேம்படுத்துவது எப்படி?",q:"How to improve score"},
  {e:"Is my data safe?",t:"தகவல் பாதுகாப்பானதா?",q:"Is my data safe"}
];

function buildUi(){
  if(document.getElementById("tc-bot-fab"))return;
  const fab=document.createElement("button");
  fab.id="tc-bot-fab";fab.className="bot-fab";fab.setAttribute("aria-label","Ask TrustCred Chatbot");
  fab.innerHTML=`<span>💬</span><span class="unread-dot" id="tc-bot-dot"></span>`;
  document.body.appendChild(fab);
  try{if(localStorage.getItem("tc_bot_seen")==="1"){const d=document.getElementById("tc-bot-dot");if(d)d.style.display="none";}}catch(e){}

  const bd=document.createElement("div");bd.id="tc-bot-backdrop";bd.className="bot-backdrop";
  document.body.appendChild(bd);

  const sh=document.createElement("div");sh.id="tc-bot-sheet";sh.className="bot-sheet";
  sh.setAttribute("role","dialog");sh.setAttribute("aria-modal","true");sh.setAttribute("aria-label","Ask TrustCred Assistant");
  sh.innerHTML=`<div class="bot-handle"></div><header class="bot-header"><div class="bot-header-info"><div class="bot-avatar">🤖</div><div class="bot-header-text"><h2>Ask TrustCred</h2><p>● Instant AI · Tamil & English</p></div></div><div class="bot-header-actions"><button class="bot-icon-btn" id="tc-bot-menu-btn" aria-label="Menu">⋮</button><button class="bot-icon-btn" id="tc-bot-close-btn" aria-label="Close Chat">✕</button><div class="bot-menu" id="tc-bot-menu"><button class="bot-menu-item" id="tc-menu-support">📞 Talk to a person</button><button class="bot-menu-item danger" id="tc-menu-clear">🗑 Clear chat</button></div></div></header><div class="bot-messages" id="tc-bot-messages" aria-live="polite"></div><div class="bot-chips-bar" id="tc-bot-chips"></div><footer class="bot-footer"><input type="text" class="bot-input" id="tc-bot-input" placeholder="Ask about score, loan, cash flow..." autocomplete="off"><button class="bot-mic-btn" id="tc-bot-mic" aria-label="Voice">🎤</button><button class="bot-send-btn" id="tc-bot-send" aria-label="Send">➤</button></footer>`;
  document.body.appendChild(sh);

  fab.onclick=openSheet;bd.onclick=closeSheet;
  document.getElementById("tc-bot-close-btn").onclick=closeSheet;
  const mBtn=document.getElementById("tc-bot-menu-btn"),mEl=document.getElementById("tc-bot-menu");
  mBtn.onclick=e=>{e.stopPropagation();mEl.classList.toggle("show");};
  document.addEventListener("click",()=>mEl.classList.remove("show"));
  document.getElementById("tc-menu-clear").onclick=()=>{chatHistory=[];renderMsgs();renderStarters();mEl.classList.remove("show");};
  document.getElementById("tc-menu-support").onclick=()=>{mEl.classList.remove("show");window.open(`https://wa.me/${HELPLINE.supportWhatsapp}?text=Hello%20TrustCred%20Support`,"_blank");};

  document.getElementById("tc-bot-send").onclick=sendMsg;
  document.getElementById("tc-bot-input").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();sendMsg();}};
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&isSheetOpen)closeSheet();});

  const mic=document.getElementById("tc-bot-mic");
  speechRec=initVoice(tr=>{document.getElementById("tc-bot-input").value=tr;sendMsg();},st=>{isListening=st;mic.classList.toggle("listening",st);});
  if(!speechRec){mic.style.display="none";}
  else{
    mic.onclick=()=>{
      if(isListening)speechRec.stop();
      else{
        const cl=(window.TrustCred&&window.TrustCred.S&&window.TrustCred.S.lang)||"en";
        speechRec.lang=cl==="ta"?"ta-IN":"en-IN";speechRec.start();
      }
    };
  }
}

function openSheet(){
  isSheetOpen=true;
  document.getElementById("tc-bot-backdrop").classList.add("open");
  document.getElementById("tc-bot-sheet").classList.add("open");
  try{localStorage.setItem("tc_bot_seen","1");const d=document.getElementById("tc-bot-dot");if(d)d.style.display="none";}catch(e){}
  if(!chatHistory.length){
    const v=getV(),cl=(window.TrustCred&&window.TrustCred.S&&window.TrustCred.S.lang)||"en";
    const g=cl==="ta"?`வணக்கம் ${v?v.vendor_id:""}! உங்கள் மதிப்பெண், வரவு, கடன் பற்றி எதையும் கேட்கலாம்.`:`Hello ${v?v.vendor_id:""}! I am Ask TrustCred. Ask me about your Trust Score, daily sales, or loan readiness.`;
    chatHistory.push({sender:"bot",text:g,lang:cl});
    renderMsgs();renderStarters();
  }
  setTimeout(()=>{const i=document.getElementById("tc-bot-input");if(i)i.focus();},260);
}

function closeSheet(){
  isSheetOpen=false;
  document.getElementById("tc-bot-backdrop").classList.remove("open");
  document.getElementById("tc-bot-sheet").classList.remove("open");
  if(window.speechSynthesis)window.speechSynthesis.cancel();
}

function renderStarters(){
  const cl=(window.TrustCred&&window.TrustCred.S&&window.TrustCred.S.lang)||"en";
  const b=document.getElementById("tc-bot-chips");if(!b)return;
  b.innerHTML=STARTER_CHIPS.map(c=>`<button class="bot-chip" data-q="${c.q}">${cl==="ta"?c.t:c.e}</button>`).join("");
  b.querySelectorAll(".bot-chip").forEach(btn=>btn.onclick=()=>{document.getElementById("tc-bot-input").value=btn.dataset.q;sendMsg();});
}

function renderMsgs(){
  const c=document.getElementById("tc-bot-messages");if(!c)return;
  c.innerHTML=chatHistory.map((m,i)=>{
    if(m.sender==="user")return`<div class="bot-msg-row user"><div class="bot-bubble">${esc(m.text)}</div></div>`;
    const txt=esc(m.text).replace(/\*\((.*?)\)\*/g,'<span class="bot-disclaimer">($1)</span>').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
    const act=m.action?(m.action.external?`<div class="bot-actions"><a class="bot-action-btn" href="${m.action.external}" target="_blank">${m.action.label}</a></div>`:`<div class="bot-actions"><button class="bot-action-btn" data-tab="${m.action.tab}">${m.action.label}</button></div>`):"";
    return`<div class="bot-msg-row bot"><div class="bot-bubble">${txt}${act}</div><button class="bot-speak-btn" data-i="${i}" aria-label="Listen">🔊 Listen</button></div>`;
  }).join("");
  c.querySelectorAll(".bot-speak-btn").forEach(b=>b.onclick=()=>{const m=chatHistory[parseInt(b.dataset.i,10)];if(m)speak(m.text,m.lang||"en");});
  c.querySelectorAll(".bot-action-btn").forEach(b=>b.onclick=()=>{
    const t=b.dataset.tab;if(t){closeSheet();if(window.TrustCred&&typeof window.TrustCred.render==="function"){window.TrustCred.S.tab=t;window.TrustCred.render();}}
  });
  c.scrollTop=c.scrollHeight;
}

function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

async function sendMsg(){
  const inp=document.getElementById("tc-bot-input");const q=inp.value.trim();if(!q)return;
  inp.value="";chatHistory.push({sender:"user",text:q});renderMsgs();
  const box=document.getElementById("tc-bot-messages");
  const typ=document.createElement("div");typ.id="tc-typ";typ.className="bot-msg-row bot";
  typ.innerHTML=`<div class="bot-typing"><span class="bot-dot"></span><span class="bot-dot"></span><span class="bot-dot"></span></div>`;
  box.appendChild(typ);box.scrollTop=box.scrollHeight;

  const v=getV(),r=getCalc(v),lng=detectLang(q);
  const m=matchIntent(q);

  setTimeout(async()=>{
    const el=document.getElementById("tc-typ");if(el)el.remove();
    if(!m||m.type==="fallback"){
      let llm=null;if(USE_LLM&&v&&r)llm=await callLlm(q,v,r);
      if(llm){
        chatHistory.push({sender:"bot",text:llm,lang:lng==="ta"?"ta":"en"});
        renderMsgs();renderChips(["My score","Can I get a loan?"]);return;
      }
      const fb=lng==="ta"?"மன்னிக்கவும், இதற்கான நேரடி பதில் என்னிடம் இல்லை. கீழே உள்ள தலைப்புகளைத் தொடலாம் அல்லது உதவிப் பிரிவினருடன் பேசலாம்.":"I am not sure about this yet. Here are related topics you can ask me about, or speak with our support team.";
      chatHistory.push({sender:"bot",text:fb,lang:lng==="ta"?"ta":"en",action:{external:`https://wa.me/${HELPLINE.supportWhatsapp}?text=Question:%20${encodeURIComponent(q)}`,label:"📞 Talk to a person"}});
      renderMsgs();renderChips(["My score","Why is my score low?","Can I get a loan?","Is my data safe?"]);return;
    }
    if(m.type==="clarify"){
      const clr=lng==="ta"?"நீங்கள் எதைப் பற்றிக் கேட்கிறீர்கள் என்பதைத் தேர்ந்தெடுக்கவும்:":"Are you asking about:";
      chatHistory.push({sender:"bot",text:clr,lang:lng==="ta"?"ta":"en"});
      renderMsgs();renderClarify(m.intents,lng);return;
    }
    const res=m.intent.reply(v,r,lng);
    lastSpk=res.text;lastLng=lng==="ta"?"ta":"en";
    chatHistory.push({sender:"bot",text:res.text,action:res.action||null,lang:lastLng});
    renderMsgs();if(m.intent.chips)renderChips(m.intent.chips);
  },240);
}

function renderChips(chs){
  const b=document.getElementById("tc-bot-chips");if(!b)return;
  b.innerHTML=chs.map(c=>`<button class="bot-chip" data-q="${c}">${c}</button>`).join("");
  b.querySelectorAll(".bot-chip").forEach(btn=>btn.onclick=()=>{document.getElementById("tc-bot-input").value=btn.dataset.q;sendMsg();});
}
function renderClarify(its,lng){
  const b=document.getElementById("tc-bot-chips");if(!b)return;
  b.innerHTML=its.map(i=>`<button class="bot-chip" data-q="${i.examples[0]}">${i.examples[0]}</button>`).join("");
  b.querySelectorAll(".bot-chip").forEach(btn=>btn.onclick=()=>{document.getElementById("tc-bot-input").value=btn.dataset.q;sendMsg();});
}

window.TrustCredBot={
  openSheet,closeSheet,
  speakLastMessage:()=>{if(lastSpk)speak(lastSpk,lastLng);},
  matchIntent,INTENTS
};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildUi);
else buildUi();
})();
