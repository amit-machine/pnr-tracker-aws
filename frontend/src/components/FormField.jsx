function FormField({
  id,
  label,
  type = "text",
  inputMode,
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  disabled,
  hint,
  error,
  invalid,
  className = "form-group",
}) {
  return (
    <div className={className}>
      {label && <label htmlFor={id}>{label}</label>}

      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={invalid}
      />

      {hint && <div className="input-hint">{hint}</div>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export default FormField;
