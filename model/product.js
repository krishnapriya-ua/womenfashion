const mongoose=require('mongoose')

const productschema=new mongoose.Schema({
   name:{
      type:String,
      required:true
   },
   description:{
      type:String
   },
   price:{
      type:Number,
      required:true
   },
   discountcoupens:{
      type:Number
   },
   discountprice:{
      type:Number
   },
    length:{
      type:String
   },
   size:{
      type:String
   },
   category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
  },
    fabric:{
      type:String
   },
    care:{
      type:String
   },
    
   stock:{
      type:Number
   },
   color:{
      type:String
   },
   style:{
      type:String
   },
    images:[{
      type:String,
      required:true
    }],
    popularity: Number,
    createdAt: { type: Date, default: Date.now ,index:true,},
  
    featured: { type: Boolean, default: false },
    
    metadata:{type:mongoose.Schema.Types.Mixed,default:{}},
    offerprice:{type:Number}

   
   
}, {timestamps: true})

const product=mongoose.model('product',productschema)
module.exports=product